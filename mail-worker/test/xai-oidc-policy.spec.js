import { describe, expect, it } from 'vitest';

import {
	normalizeXaiUser,
	validateXaiClaims,
	validateXaiRedirectUri,
} from '../src/service/xai-oidc-policy';

describe('XAI callback URL policy', () => {
	it('accepts the exact HTTPS callback on the web application origin', () => {
		expect(validateXaiRedirectUri(
			'https://mail.example.com/api/oauth/xai/callback',
			'https://mail.example.com',
		)).toBe('https://mail.example.com/api/oauth/xai/callback');
	});

	it.each([
		['http://mail.example.com/api/oauth/xai/callback', 'https://mail.example.com'],
		['https://other.example.com/api/oauth/xai/callback', 'https://mail.example.com'],
		['https://mail.example.com/oauth/xai/callback', 'https://mail.example.com'],
		['https://mail.example.com/api/oauth/xai/callback?next=/login', 'https://mail.example.com'],
		['https://mail.example.com/api/oauth/xai/callback#fragment', 'https://mail.example.com'],
		['https://localhost/api/oauth/xai/callback', 'https://localhost'],
		['https://192.0.2.10/api/oauth/xai/callback', 'https://192.0.2.10'],
	])('rejects an invalid callback %s', (callback, origin) => {
		expect(() => validateXaiRedirectUri(callback, origin)).toThrow();
	});
});

describe('XAI identity policy', () => {
	const now = 1_800_000_000;
	const claims = { sub: 'usr_xai_123', iat: now - 10 };
	const userInfo = {
		sub: 'usr_xai_123',
		preferred_username: 'alice',
		name: 'Alice',
		picture: 'https://cdn.example.com/alice.png',
		trust_level: 2,
		active: true,
		silenced: false,
	};

	it('accepts an active unsilenced identity and maps only local profile fields', () => {
		expect(validateXaiClaims(claims, userInfo, now)).toBeUndefined();
		expect(normalizeXaiUser(userInfo)).toEqual({
			oauthUserId: 'usr_xai_123',
			username: 'alice',
			name: 'Alice',
			avatar: 'https://cdn.example.com/alice.png',
			active: 1,
			trustLevel: 2,
			silenced: 0,
			platform: 'xai',
		});
	});

	it.each([
		[{ ...claims, sub: 'different-user' }, userInfo],
		[{ ...claims, iat: now + 61 }, userInfo],
		[{ sub: claims.sub }, userInfo],
		[claims, { ...userInfo, active: false }],
		[claims, { ...userInfo, silenced: true }],
	])('rejects an identity that cannot establish a local session', (idTokenClaims, profile) => {
		expect(() => validateXaiClaims(idTokenClaims, profile, now)).toThrow();
	});
});
