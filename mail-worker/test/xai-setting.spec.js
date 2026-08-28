import { describe, expect, it } from 'vitest';

import settingService from '../src/service/setting-service';
import { openValue } from '../src/utils/sealed-value';

describe('XAI settings persistence', () => {
	const context = {
		env: {
			jwt_secret: 'setting-test-master-secret-with-enough-entropy',
		},
	};

	it('encrypts a newly submitted client secret before persistence', async () => {
		const update = await settingService.prepareUpdate(context, {
			resendTokens: {},
		}, {
			xaiClientId: 'client-id',
			xaiClientSecret: 'plain-client-secret',
			xaiRedirectUri: 'https://mail.example.com/api/oauth/xai/callback',
			xaiSwitch: 0,
		});

		expect(update.xaiClientSecret).toMatch(/^v1\./);
		expect(update.xaiClientSecret).not.toContain('plain-client-secret');
		await expect(openValue(
			context.env.jwt_secret,
			'xai-client-secret',
			update.xaiClientSecret,
		)).resolves.toBe('plain-client-secret');
	});

	it('keeps the stored client secret when the submitted value is empty', async () => {
		const update = await settingService.prepareUpdate(context, {
			resendTokens: {},
			xaiClientSecret: 'v1.existing.encrypted',
		}, {
			xaiClientId: 'updated-client-id',
			xaiClientSecret: '   ',
		});

		expect(update).not.toHaveProperty('xaiClientSecret');
		expect(update.xaiClientId).toBe('updated-client-id');
	});

	it('returns only a configured flag instead of the stored secret', () => {
		const stored = {
			xaiClientId: 'client-id',
			xaiClientSecret: 'v1.iv.ciphertext',
			resendTokens: { 'example.com': 'resend-token' },
		};

		const sanitized = settingService.sanitizeForAdmin(stored);

		expect(sanitized).not.toHaveProperty('xaiClientSecret');
		expect(sanitized.xaiClientSecretConfigured).toBe(true);
		expect(stored.xaiClientSecret).toBe('v1.iv.ciphertext');
		expect(sanitized.resendTokens).not.toBe(stored.resendTokens);
	});
});
