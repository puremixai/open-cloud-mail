import { describe, expect, it } from 'vitest';

import { createOAuthSessionService } from '../src/service/oauth-session-service';

function createMemoryRepository() {
	const rows = new Map();

	return {
		rows,
		async insert(row) {
			if (rows.has(row.state)) throw new Error('duplicate state');
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
			row.status = 'verified';
			row.oauthUserId = oauthUserId;
			row.nonce = '';
			row.codeVerifier = '';
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
			let deleted = 0;
			for (const [state, row] of rows) {
				if (row.expiresAt <= nowSeconds) {
					rows.delete(state);
					deleted += 1;
				}
			}
			return deleted;
		},
	};
}

describe('XAI server-side OAuth session', () => {
	it('allows one callback claim and completes the verified lifecycle', async () => {
		const repository = createMemoryRepository();
		const service = createOAuthSessionService(repository);
		const pending = await service.create({
			state: 'state-123',
			platform: 'xai',
			nonce: 'nonce-123',
			codeVerifier: 'verifier-123',
			redirectUri: 'https://mail.example.com/api/oauth/xai/callback',
		}, 1_000);

		expect(pending).toMatchObject({
			status: 'pending',
			createTime: 1_000,
			expiresAt: 1_600,
		});

		await expect(service.claim('state-123', 1_100)).resolves.toMatchObject({ status: 'exchanging' });
		await expect(service.claim('state-123', 1_101)).rejects.toMatchObject({ name: 'BizError' });
		await expect(service.markVerified('state-123', 'usr_xai_123', 1_102)).resolves.toMatchObject({
			status: 'verified',
			oauthUserId: 'usr_xai_123',
			nonce: '',
			codeVerifier: '',
		});
		await expect(service.getVerified('state-123', 1_103)).resolves.toMatchObject({
			oauthUserId: 'usr_xai_123',
		});

		await service.delete('state-123');
		await expect(service.getVerified('state-123', 1_104)).rejects.toMatchObject({ name: 'BizError' });
	});

	it('rejects and clears expired transactions', async () => {
		const repository = createMemoryRepository();
		const service = createOAuthSessionService(repository);
		await service.create({
			state: 'expired-state',
			platform: 'xai',
			nonce: 'nonce',
			codeVerifier: 'verifier',
			redirectUri: 'https://mail.example.com/api/oauth/xai/callback',
		}, 2_000, 10);

		await expect(service.claim('expired-state', 2_010)).rejects.toMatchObject({ name: 'BizError' });
		await expect(service.clearExpired(2_010)).resolves.toBe(1);
		expect(repository.rows.size).toBe(0);
	});

	it('rejects a missing cookie state before querying the repository', async () => {
		let repositoryCalled = false;
		const service = createOAuthSessionService({
			async findVerified() {
				repositoryCalled = true;
				return null;
			},
		});

		await expect(service.getVerified('', 3_000)).rejects.toMatchObject({
			name: 'BizError',
			code: 401,
		});
		expect(repositoryCalled).toBe(false);
	});
});
