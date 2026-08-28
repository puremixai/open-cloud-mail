import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";
import xaiOAuthService from '../service/xai-oauth-service';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

export const XAI_OAUTH_COOKIE = 'cloud_mail_xai_oauth';
const XAI_COOKIE_PATH = '/api/oauth/xai';

function setXaiCookie(c, state) {
	setCookie(c, XAI_OAUTH_COOKIE, state, {
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		path: XAI_COOKIE_PATH,
		maxAge: 600,
	});
}

function clearXaiCookie(c) {
	deleteCookie(c, XAI_OAUTH_COOKIE, {
		secure: true,
		path: XAI_COOKIE_PATH,
	});
}

function loginRedirect(c, errorCode) {
	const url = new URL('/login', c.req.url);
	url.searchParams.set('oauth', 'xai');
	if (errorCode) url.searchParams.set('error', errorCode);
	return c.redirect(url.toString());
}

app.post('/oauth/linuxDo/login', async (c) => {
	const loginInfo = await oauthService.linuxDoLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.post('/oauth/github/login', async (c) => {
	const loginInfo = await oauthService.githubLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.post('/oauth/google/login', async (c) => {
	const loginInfo = await oauthService.googleLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.put('/oauth/bindUser', async (c) => {
	const loginInfo = await oauthService.bindUser(c, await c.req.json());
	return c.json(result.ok(loginInfo))
})

export function registerXaiOAuthRoutes(targetApp, service = xaiOAuthService) {
	targetApp.get('/oauth/xai/start', async (c) => {
		const existingState = getCookie(c, XAI_OAUTH_COOKIE);
		if (existingState) await service.cancel(c, existingState);

		const { authorizationUrl, state } = await service.start(c, new URL(c.req.url).origin);
		setXaiCookie(c, state);
		return c.redirect(authorizationUrl);
	});

	targetApp.get('/oauth/xai/callback', async (c) => {
		const expectedState = getCookie(c, XAI_OAUTH_COOKIE);
		const returnedState = c.req.query('state');
		const providerError = c.req.query('error');
		if (!expectedState || returnedState !== expectedState) {
			return loginRedirect(c, 'verification_failed');
		}

		if (providerError) {
			await service.cancel(c, expectedState);
			clearXaiCookie(c);
			return loginRedirect(c, providerError === 'access_denied' ? 'access_denied' : 'provider_error');
		}

		try {
			const requestUrl = new URL(c.req.url);
			await service.callback(c, {
				state: returnedState,
				expectedState,
				queryString: requestUrl.search,
				requestOrigin: requestUrl.origin,
			});
			return loginRedirect(c);
		} catch (error) {
			await service.cancel(c, expectedState);
			clearXaiCookie(c);
			return loginRedirect(c, error?.code === 403 ? 'account_unavailable' : 'verification_failed');
		}
	});

	targetApp.post('/oauth/xai/complete', async (c) => {
		const state = getCookie(c, XAI_OAUTH_COOKIE);
		const loginInfo = await service.complete(c, state);
		if (loginInfo.token) clearXaiCookie(c);
		return c.json(result.ok(loginInfo));
	});

	targetApp.put('/oauth/xai/bindUser', async (c) => {
		const state = getCookie(c, XAI_OAUTH_COOKIE);
		const body = await c.req.json();
		const loginInfo = await service.bindUser(c, state, {
			email: body.email,
			code: body.code,
		});
		clearXaiCookie(c);
		return c.json(result.ok(loginInfo));
	});
}

registerXaiOAuthRoutes(app);
