import { and, eq, gt, lte } from 'drizzle-orm';

import oauthSession from '../entity/oauth-session';
import orm from '../entity/orm';
import BizError from '../error/biz-error';

const DEFAULT_TTL_SECONDS = 600;

function assertState(state) {
	if (typeof state !== 'string' || !state) {
		throw new BizError('XAI 登录会话标识缺失', 401);
	}
}

function assertSessionData(data) {
	for (const key of ['state', 'platform', 'nonce', 'codeVerifier', 'redirectUri']) {
		if (typeof data[key] !== 'string' || !data[key]) {
			throw new BizError('XAI 登录会话参数无效');
		}
	}
}

export function createOAuthSessionService(repository) {
	return {
		async create(data, nowSeconds = Math.floor(Date.now() / 1000), ttlSeconds = DEFAULT_TTL_SECONDS) {
			assertSessionData(data);
			const row = {
				...data,
				status: 'pending',
				oauthUserId: '',
				createTime: nowSeconds,
				expiresAt: nowSeconds + ttlSeconds,
			};
			return repository.insert(row);
		},

		async claim(state, nowSeconds = Math.floor(Date.now() / 1000)) {
			assertState(state);
			const row = await repository.claim(state, nowSeconds);
			if (!row) throw new BizError('XAI 登录会话无效、过期或已使用', 401);
			return row;
		},

		async markVerified(state, oauthUserId, nowSeconds = Math.floor(Date.now() / 1000)) {
			assertState(state);
			if (typeof oauthUserId !== 'string' || !oauthUserId) throw new BizError('XAI 用户身份无效');
			const row = await repository.markVerified(state, oauthUserId, nowSeconds);
			if (!row) throw new BizError('XAI 登录会话无法完成', 401);
			return row;
		},

		async getVerified(state, nowSeconds = Math.floor(Date.now() / 1000)) {
			assertState(state);
			const row = await repository.findVerified(state, nowSeconds);
			if (!row) throw new BizError('XAI 登录会话无效或已过期', 401);
			return row;
		},

		async delete(state) {
			assertState(state);
			await repository.remove(state);
		},

		async clearExpired(nowSeconds = Math.floor(Date.now() / 1000)) {
			return repository.removeExpired(nowSeconds);
		},
	};
}

export function createD1OAuthSessionRepository(c) {
	return {
		async insert(row) {
			return orm(c).insert(oauthSession).values(row).returning().get();
		},

		async claim(state, nowSeconds) {
			return orm(c).update(oauthSession)
				.set({ status: 'exchanging' })
				.where(and(
					eq(oauthSession.state, state),
					eq(oauthSession.status, 'pending'),
					gt(oauthSession.expiresAt, nowSeconds),
				))
				.returning()
				.get();
		},

		async markVerified(state, oauthUserId, nowSeconds) {
			return orm(c).update(oauthSession)
				.set({
					status: 'verified',
					oauthUserId,
					nonce: '',
					codeVerifier: '',
				})
				.where(and(
					eq(oauthSession.state, state),
					eq(oauthSession.status, 'exchanging'),
					gt(oauthSession.expiresAt, nowSeconds),
				))
				.returning()
				.get();
		},

		async findVerified(state, nowSeconds) {
			return orm(c).select()
				.from(oauthSession)
				.where(and(
					eq(oauthSession.state, state),
					eq(oauthSession.status, 'verified'),
					gt(oauthSession.expiresAt, nowSeconds),
				))
				.get();
		},

		async remove(state) {
			await orm(c).delete(oauthSession).where(eq(oauthSession.state, state)).run();
		},

		async removeExpired(nowSeconds) {
			const result = await orm(c).delete(oauthSession).where(lte(oauthSession.expiresAt, nowSeconds)).run();
			return result?.meta?.changes ?? result?.changes ?? 0;
		},
	};
}

function forContext(c) {
	return createOAuthSessionService(createD1OAuthSessionRepository(c));
}

const oauthSessionService = {
	create(c, data, nowSeconds, ttlSeconds) {
		return forContext(c).create(data, nowSeconds, ttlSeconds);
	},
	claim(c, state, nowSeconds) {
		return forContext(c).claim(state, nowSeconds);
	},
	markVerified(c, state, oauthUserId, nowSeconds) {
		return forContext(c).markVerified(state, oauthUserId, nowSeconds);
	},
	getVerified(c, state, nowSeconds) {
		return forContext(c).getVerified(state, nowSeconds);
	},
	delete(c, state) {
		return forContext(c).delete(state);
	},
	clearExpired(c, nowSeconds) {
		return forContext(c).clearExpired(nowSeconds);
	},
};

export default oauthSessionService;
