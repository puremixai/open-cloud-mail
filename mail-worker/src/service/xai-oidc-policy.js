import BizError from '../error/biz-error';

const CALLBACK_PATH = '/api/oauth/xai/callback';

function isIpAddress(hostname) {
	const host = hostname.replace(/^\[|\]$/g, '');
	if (host.includes(':')) return true;
	const parts = host.split('.');
	return parts.length === 4 && parts.every(part => /^\d+$/.test(part) && Number(part) <= 255);
}

export function validateXaiRedirectUri(value, requestOrigin) {
	let callback;
	let origin;

	try {
		callback = new URL(value);
		origin = new URL(requestOrigin);
	} catch {
		throw new BizError('XAI 回调地址格式无效');
	}

	if (
		callback.protocol !== 'https:'
		|| callback.origin !== origin.origin
		|| callback.pathname !== CALLBACK_PATH
		|| callback.search
		|| callback.hash
		|| callback.username
		|| callback.password
		|| callback.hostname === 'localhost'
		|| callback.hostname.includes('*')
		|| isIpAddress(callback.hostname)
	) {
		throw new BizError(`XAI 回调地址必须是当前网站域名下的精确 HTTPS 地址：${CALLBACK_PATH}`);
	}

	return callback.toString();
}

export function validateXaiClaims(idTokenClaims, userInfo, nowSeconds = Math.floor(Date.now() / 1000)) {
	const subject = idTokenClaims?.sub;
	if (typeof subject !== 'string' || !subject || userInfo?.sub !== subject) {
		throw new BizError('XAI 用户身份校验失败');
	}

	if (typeof idTokenClaims.iat !== 'number' || idTokenClaims.iat > nowSeconds + 60) {
		throw new BizError('XAI ID Token 签发时间无效');
	}

	if (userInfo.active !== true) {
		throw new BizError('XAI 账号当前不可登录', 403);
	}

	if (userInfo.silenced === true) {
		throw new BizError('XAI 账号已被禁言，无法登录', 403);
	}
}

export function normalizeXaiUser(userInfo) {
	const oauthUserId = String(userInfo.sub);
	const username = typeof userInfo.preferred_username === 'string' && userInfo.preferred_username
		? userInfo.preferred_username
		: (typeof userInfo.name === 'string' && userInfo.name ? userInfo.name : oauthUserId);

	return {
		oauthUserId,
		username,
		name: typeof userInfo.name === 'string' && userInfo.name ? userInfo.name : username,
		avatar: typeof userInfo.picture === 'string' ? userInfo.picture : '',
		active: 1,
		trustLevel: Number.isInteger(userInfo.trust_level) ? userInfo.trust_level : null,
		silenced: userInfo.silenced === true ? 1 : 0,
		platform: 'xai',
	};
}

export { CALLBACK_PATH as XAI_CALLBACK_PATH };
