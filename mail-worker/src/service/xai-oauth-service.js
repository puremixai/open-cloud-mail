import * as openidClient from 'openid-client';

import BizError from '../error/biz-error';
import { openValue } from '../utils/sealed-value';
import loginService from './login-service';
import oauthService from './oauth-service';
import oauthSessionService from './oauth-session-service';
import settingService from './setting-service';
import userService from './user-service';
import {
	normalizeXaiUser,
	validateXaiClaims,
	validateXaiRedirectUri,
} from './xai-oidc-policy';

const XAI_ISSUER = new URL('https://connect.xai.run');
const XAI_SCOPE = 'openid profile community';
const XAI_SECRET_PURPOSE = 'xai-client-secret';

function requireConfiguredSetting(setting) {
	if (setting.xaiSwitch !== 0) throw new BizError('XAI 登录已关闭');
	if (!setting.xaiClientId || !setting.xaiClientSecret || !setting.xaiRedirectUri) {
		throw new BizError('XAI 登录配置不完整');
	}
}

export function createXaiOAuthService({
	oidc = openidClient,
	settings = settingService,
	sessions = oauthSessionService,
	oauthUsers = oauthService,
	users = userService,
	login = loginService,
	now = () => Math.floor(Date.now() / 1000),
} = {}) {
	async function loadConfiguration(c, requestOrigin) {
		const setting = await settings.query(c);
		requireConfiguredSetting(setting);
		const redirectUri = validateXaiRedirectUri(setting.xaiRedirectUri, requestOrigin);
		const clientSecret = await openValue(c.env.jwt_secret, XAI_SECRET_PURPOSE, setting.xaiClientSecret);
		const clientAuthentication = oidc.ClientSecretBasic(clientSecret);
		const config = await oidc.discovery(
			XAI_ISSUER,
			setting.xaiClientId,
			{ client_secret: clientSecret },
			clientAuthentication,
		);

		return { config, redirectUri };
	}

	return {
		async start(c, requestOrigin) {
			try {
				const { config, redirectUri } = await loadConfiguration(c, requestOrigin);
				const state = oidc.randomState();
				const nonce = oidc.randomNonce();
				const codeVerifier = oidc.randomPKCECodeVerifier();
				const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

				await sessions.create(c, {
					state,
					platform: 'xai',
					nonce,
					codeVerifier,
					redirectUri,
				}, now());

				const authorizationUrl = oidc.buildAuthorizationUrl(config, {
					redirect_uri: redirectUri,
					scope: XAI_SCOPE,
					state,
					nonce,
					code_challenge: codeChallenge,
					code_challenge_method: 'S256',
				});

				return { authorizationUrl: authorizationUrl.toString(), state };
			} catch (error) {
				if (error instanceof BizError) throw error;
				throw new BizError('XAI OIDC 服务暂时不可用');
			}
		},

		async callback(c, { state, expectedState, queryString, requestOrigin }) {
			if (!state || !expectedState || state !== expectedState) {
				throw new BizError('XAI 登录 state 校验失败', 401);
			}

			let session;
			try {
				session = await sessions.claim(c, state, now());
				const { config, redirectUri } = await loadConfiguration(c, requestOrigin);
				if (session.platform !== 'xai' || session.redirectUri !== redirectUri) {
					throw new BizError('XAI 登录会话与回调地址不匹配', 401);
				}

				const callbackUrl = new URL(redirectUri);
				callbackUrl.search = queryString || '';
				const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
					pkceCodeVerifier: session.codeVerifier,
					expectedNonce: session.nonce,
					expectedState: state,
					idTokenExpected: true,
				});

				const claims = typeof tokens.claims === 'function' ? tokens.claims() : null;
				if (!claims || typeof tokens.access_token !== 'string' || !tokens.access_token) {
					throw new BizError('XAI Token 响应无效');
				}

				const userInfo = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
				validateXaiClaims(claims, userInfo, now());
				const oauthRow = await oauthUsers.saveUser(c, normalizeXaiUser(userInfo));
				await sessions.markVerified(c, state, String(claims.sub), now());

				return { userInfo: oauthRow };
			} catch (error) {
				if (session) await sessions.delete(c, state);
				if (error instanceof BizError) throw error;
				throw new BizError('XAI 登录验证失败');
			}
		},

		async complete(c, state) {
			const session = await sessions.getVerified(c, state, now());
			const oauthRow = await oauthUsers.getById(c, session.oauthUserId, 'xai');
			if (!oauthRow) {
				await sessions.delete(c, state);
				throw new BizError('XAI 用户绑定记录不存在', 401);
			}

			const userRow = await users.selectByIdIncludeDel(c, oauthRow.userId);
			if (!userRow) return { userInfo: oauthRow, token: null };

			const token = await login.login(c, { email: userRow.email, password: null }, true);
			await sessions.delete(c, state);
			return { userInfo: oauthRow, token };
		},

		async bindUser(c, state, params) {
			const session = await sessions.getVerified(c, state, now());
			const oauthRow = await oauthUsers.getById(c, session.oauthUserId, 'xai');
			if (!oauthRow) {
				await sessions.delete(c, state);
				throw new BizError('XAI 用户绑定记录不存在', 401);
			}

			const result = await oauthUsers.bindVerifiedUser(c, oauthRow, {
				email: params.email,
				code: params.code,
			});
			await sessions.delete(c, state);
			return result;
		},

		async cancel(c, state) {
			if (state) await sessions.delete(c, state);
		},

		clearExpired(c) {
			return sessions.clearExpired(c, now());
		},
	};
}

const xaiOAuthService = createXaiOAuthService();

export default xaiOAuthService;
export { XAI_ISSUER, XAI_SCOPE };
