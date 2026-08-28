import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import {
	registerXaiOAuthRoutes,
	XAI_OAUTH_COOKIE,
} from '../src/api/oauth-api';

function createTestApp(service) {
	const app = new Hono();
	registerXaiOAuthRoutes(app, service);
	return app;
}

describe('XAI OAuth routes', () => {
	it('starts on the Worker and stores only the opaque state in a secure cookie', async () => {
		const app = createTestApp({
			start: async () => ({
				authorizationUrl: 'https://connect.xai.run/oauth2/auth?state=state-123',
				state: 'state-123',
			}),
			cancel: async () => undefined,
		});

		const response = await app.request('https://mail.example.com/oauth/xai/start');

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('https://connect.xai.run/oauth2/auth?state=state-123');
		const cookie = response.headers.get('set-cookie');
		expect(cookie).toContain(`${XAI_OAUTH_COOKIE}=state-123`);
		expect(cookie).toContain('HttpOnly');
		expect(cookie).toContain('Secure');
		expect(cookie).toContain('SameSite=Lax');
		expect(cookie).toContain('Path=/api/oauth/xai');
		expect(cookie).not.toContain('nonce');
		expect(cookie).not.toContain('verifier');
	});

	it('passes the exact callback query and cookie-bound state to the service', async () => {
		let callbackInput;
		const app = createTestApp({
			callback: async (_context, input) => {
				callbackInput = input;
			},
			cancel: async () => undefined,
		});

		const response = await app.request(
			'https://mail.example.com/oauth/xai/callback?code=authorization-code&state=state-123',
			{ headers: { Cookie: `${XAI_OAUTH_COOKIE}=state-123` } },
		);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('https://mail.example.com/login?oauth=xai');
		expect(callbackInput).toEqual({
			state: 'state-123',
			expectedState: 'state-123',
			queryString: '?code=authorization-code&state=state-123',
			requestOrigin: 'https://mail.example.com',
		});
	});

	it('clears the transaction and redirects with a non-sensitive provider error', async () => {
		let cancelledState;
		const app = createTestApp({
			cancel: async (_context, state) => {
				cancelledState = state;
			},
		});

		const response = await app.request(
			'https://mail.example.com/oauth/xai/callback?error=access_denied&state=state-123',
			{ headers: { Cookie: `${XAI_OAUTH_COOKIE}=state-123` } },
		);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('https://mail.example.com/login?oauth=xai&error=access_denied');
		expect(cancelledState).toBe('state-123');
		expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
	});

	it('does not cancel a valid cookie session when a provider error has a different state', async () => {
		let cancelCount = 0;
		const app = createTestApp({
			cancel: async () => {
				cancelCount += 1;
			},
		});

		const response = await app.request(
			'https://mail.example.com/oauth/xai/callback?error=access_denied&state=attacker-state',
			{ headers: { Cookie: `${XAI_OAUTH_COOKIE}=valid-state` } },
		);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('https://mail.example.com/login?oauth=xai&error=verification_failed');
		expect(cancelCount).toBe(0);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	it('does not cancel a valid cookie session when a code callback has a different state', async () => {
		let cancelCount = 0;
		let callbackCount = 0;
		const app = createTestApp({
			callback: async () => {
				callbackCount += 1;
			},
			cancel: async () => {
				cancelCount += 1;
			},
		});

		const response = await app.request(
			'https://mail.example.com/oauth/xai/callback?code=attacker-code&state=attacker-state',
			{ headers: { Cookie: `${XAI_OAUTH_COOKIE}=valid-state` } },
		);

		expect(response.headers.get('location')).toBe('https://mail.example.com/login?oauth=xai&error=verification_failed');
		expect(callbackCount).toBe(0);
		expect(cancelCount).toBe(0);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	it('completes and binds through the cookie session without a body subject', async () => {
		let bindInput;
		const app = createTestApp({
			complete: async () => ({
				userInfo: { oauthUserId: 'usr_xai_123', platform: 'xai' },
				token: null,
			}),
			bindUser: async (_context, state, input) => {
				bindInput = { state, input };
				return { userInfo: { oauthUserId: 'usr_xai_123' }, token: 'local-token' };
			},
		});

		const completeResponse = await app.request('https://mail.example.com/oauth/xai/complete', {
			method: 'POST',
			headers: { Cookie: `${XAI_OAUTH_COOKIE}=state-123` },
		});
		expect(await completeResponse.json()).toMatchObject({
			code: 200,
			data: { token: null, userInfo: { oauthUserId: 'usr_xai_123' } },
		});

		const bindResponse = await app.request('https://mail.example.com/oauth/xai/bindUser', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Cookie: `${XAI_OAUTH_COOKIE}=state-123`,
			},
			body: JSON.stringify({ email: 'new-user@example.com', code: '', oauthUserId: 'attacker-value' }),
		});

		expect(bindInput).toEqual({
			state: 'state-123',
			input: { email: 'new-user@example.com', code: '' },
		});
		expect((await bindResponse.json()).data.token).toBe('local-token');
		expect(bindResponse.headers.get('set-cookie')).toContain('Max-Age=0');
	});
});
