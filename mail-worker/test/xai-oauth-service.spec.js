import { beforeEach, describe, expect, it } from 'vitest';

import { createXaiOAuthService } from '../src/service/xai-oauth-service';
import { createOAuthSessionService } from '../src/service/oauth-session-service';
import { sealValue } from '../src/utils/sealed-value';

const NOW = 1_800_000_000;
const REDIRECT_URI = 'https://mail.example.com/api/oauth/xai/callback';

function createMemorySessionRepository() {
	const rows = new Map();
	return {
		rows,
		async insert(row) {
			rows.set(row.state, { ...row });
			return { ...row };
		},
		async claim(state, nowSeconds) {
			const row = rows.get(state);
			if (!row || row.status !== 'pending' || row.expiresAt <= nowSeconds) return null;
			row.status = 'exchanging';
			return { ...row };
		},
		async markVerified(state, oauthUserId, nowSeconds) {
			const row = rows.get(state);
			if (!row || row.status !== 'exchanging' || row.expiresAt <= nowSeconds) return null;
			Object.assign(row, { status: 'verified', oauthUserId, nonce: '', codeVerifier: '' });
			return { ...row };
		},
		async findVerified(state, nowSeconds) {
			const row = rows.get(state);
			return row?.status === 'verified' && row.expiresAt > nowSeconds ? { ...row } : null;
		},
		async remove(state) {
			rows.delete(state);
		},
		async removeExpired(nowSeconds) {
			let count = 0;
			for (const [state, row] of rows) {
				if (row.expiresAt <= nowSeconds) {
					rows.delete(state);
					count += 1;
				}
			}
			return count;
		},
	};
}

function createOidcAdapter(overrides = {}) {
	const calls = {};
	const adapter = {
		calls,
		randomState: () => 'state-123',
		randomNonce: () => 'nonce-123',
		randomPKCECodeVerifier: () => 'verifier-123',
		calculatePKCECodeChallenge: async verifier => `challenge-for-${verifier}`,
		ClientSecretBasic: secret => ({ method: 'client_secret_basic', secret }),
		async discovery(server, clientId, metadata, clientAuthentication) {
			calls.discovery = { server: server.toString(), clientId, metadata, clientAuthentication };
			return { kind: 'oidc-config' };
		},
		buildAuthorizationUrl(config, parameters) {
			calls.authorization = { config, parameters };
			const url = new URL('https://connect.xai.run/oauth2/auth');
			url.search = new URLSearchParams(parameters).toString();
			return url;
		},
		async authorizationCodeGrant(config, currentUrl, checks) {
			calls.grant = { config, currentUrl: currentUrl.toString(), checks };
			return {
				access_token: 'opaque-xai-access-token',
				claims: () => ({ sub: 'usr_xai_123', iat: NOW - 10 }),
			};
		},
		async fetchUserInfo(config, accessToken, subject) {
			calls.userInfo = { config, accessToken, subject };
			return {
				sub: 'usr_xai_123',
				preferred_username: 'alice',
				name: 'Alice',
				picture: 'https://cdn.example.com/alice.png',
				trust_level: 2,
				active: true,
				silenced: false,
			};
		},
		...overrides,
	};
	return adapter;
}

function wrapSessions(repository) {
	const service = createOAuthSessionService(repository);
	return {
		create: (_context, data, nowSeconds, ttlSeconds) => service.create(data, nowSeconds, ttlSeconds),
		claim: (_context, state, nowSeconds) => service.claim(state, nowSeconds),
		markVerified: (_context, state, oauthUserId, nowSeconds) => service.markVerified(state, oauthUserId, nowSeconds),
		getVerified: (_context, state, nowSeconds) => service.getVerified(state, nowSeconds),
		delete: (_context, state) => service.delete(state),
		clearExpired: (_context, nowSeconds) => service.clearExpired(nowSeconds),
	};
}

describe('XAI OIDC service flow', () => {
	let context;
	let storedSetting;
	let repository;
	let sessions;
	let oidc;
	let savedOAuthUser;
	let oauthUsers;
	let users;
	let login;

	beforeEach(async () => {
		context = { env: { jwt_secret: 'xai-service-master-secret-with-enough-entropy' } };
		storedSetting = {
			xaiSwitch: 0,
			xaiClientId: 'xai-client-id',
			xaiClientSecret: await sealValue(
				context.env.jwt_secret,
				'xai-client-secret',
				'xai-client-secret-value',
			),
			xaiRedirectUri: REDIRECT_URI,
		};
		repository = createMemorySessionRepository();
		sessions = wrapSessions(repository);
		oidc = createOidcAdapter();
		savedOAuthUser = null;
		oauthUsers = {
			async saveUser(_context, profile) {
				savedOAuthUser = { ...profile, userId: 0 };
				return savedOAuthUser;
			},
			async getById(_context, oauthUserId, platform) {
				return savedOAuthUser?.oauthUserId === oauthUserId && platform === 'xai'
					? { ...savedOAuthUser }
					: null;
			},
			async bindVerifiedUser(_context, oauthRow, params) {
				return { userInfo: oauthRow, token: `bound:${params.email}:${params.code ?? ''}` };
			},
		};
		users = {
			selectByIdIncludeDel: async () => null,
		};
		login = {
			login: async () => 'local-cloud-mail-token',
		};
	});

	function makeService() {
		return createXaiOAuthService({
			oidc,
			settings: { query: async () => storedSetting },
			sessions,
			oauthUsers,
			users,
			login,
			now: () => NOW,
		});
	}

	it('starts Authorization Code + PKCE and persists all one-time values server-side', async () => {
		const result = await makeService().start(context, 'https://mail.example.com');
		const authorizationUrl = new URL(result.authorizationUrl);

		expect(result.state).toBe('state-123');
		expect(authorizationUrl.origin + authorizationUrl.pathname).toBe('https://connect.xai.run/oauth2/auth');
		expect(Object.fromEntries(authorizationUrl.searchParams)).toEqual({
			redirect_uri: REDIRECT_URI,
			scope: 'openid profile community',
			state: 'state-123',
			nonce: 'nonce-123',
			code_challenge: 'challenge-for-verifier-123',
			code_challenge_method: 'S256',
		});
		expect(repository.rows.get('state-123')).toMatchObject({
			nonce: 'nonce-123',
			codeVerifier: 'verifier-123',
			redirectUri: REDIRECT_URI,
			status: 'pending',
		});
	});

	it('exchanges against the exact external callback and stores only verified profile data', async () => {
		const service = makeService();
		await service.start(context, 'https://mail.example.com');

		const result = await service.callback(context, {
			state: 'state-123',
			expectedState: 'state-123',
			queryString: '?code=authorization-code&state=state-123',
			requestOrigin: 'https://mail.example.com',
		});

		expect(oidc.calls.grant).toEqual({
			config: { kind: 'oidc-config' },
			currentUrl: `${REDIRECT_URI}?code=authorization-code&state=state-123`,
			checks: {
				pkceCodeVerifier: 'verifier-123',
				expectedNonce: 'nonce-123',
				expectedState: 'state-123',
				idTokenExpected: true,
			},
		});
		expect(savedOAuthUser).toMatchObject({
			oauthUserId: 'usr_xai_123',
			username: 'alice',
			platform: 'xai',
			userId: 0,
		});
		expect(result.userInfo).toEqual(savedOAuthUser);
		expect(JSON.stringify(result)).not.toContain('opaque-xai-access-token');
		await expect(sessions.getVerified(context, 'state-123', NOW)).resolves.toMatchObject({
			oauthUserId: 'usr_xai_123',
		});
	});

	it('deletes the server-side transaction when XAI reports an inactive user', async () => {
		oidc = createOidcAdapter({
			fetchUserInfo: async () => ({
				sub: 'usr_xai_123',
				active: false,
				silenced: false,
			}),
		});
		const service = makeService();
		await service.start(context, 'https://mail.example.com');

		await expect(service.callback(context, {
			state: 'state-123',
			expectedState: 'state-123',
			queryString: '?code=authorization-code&state=state-123',
			requestOrigin: 'https://mail.example.com',
		})).rejects.toMatchObject({ name: 'BizError', code: 403 });
		expect(repository.rows.has('state-123')).toBe(false);
	});

	it('completes a bound identity with a local token and consumes the transaction', async () => {
		const service = makeService();
		await service.start(context, 'https://mail.example.com');
		await service.callback(context, {
			state: 'state-123',
			expectedState: 'state-123',
			queryString: '?code=authorization-code&state=state-123',
			requestOrigin: 'https://mail.example.com',
		});
		savedOAuthUser.userId = 7;
		users.selectByIdIncludeDel = async userId => ({ userId, email: 'alice@example.com' });

		await expect(service.complete(context, 'state-123')).resolves.toMatchObject({
			token: 'local-cloud-mail-token',
			userInfo: { oauthUserId: 'usr_xai_123', platform: 'xai' },
		});
		expect(repository.rows.has('state-123')).toBe(false);
	});

	it('binds only the verified session identity and ignores a body-supplied subject', async () => {
		const service = makeService();
		await service.start(context, 'https://mail.example.com');
		await service.callback(context, {
			state: 'state-123',
			expectedState: 'state-123',
			queryString: '?code=authorization-code&state=state-123',
			requestOrigin: 'https://mail.example.com',
		});

		await expect(service.bindUser(context, 'state-123', {
			email: 'new-user@example.com',
			code: '',
			oauthUserId: 'attacker-controlled-subject',
		})).resolves.toMatchObject({
			token: 'bound:new-user@example.com:',
			userInfo: { oauthUserId: 'usr_xai_123' },
		});
		expect(repository.rows.has('state-123')).toBe(false);
	});
});
