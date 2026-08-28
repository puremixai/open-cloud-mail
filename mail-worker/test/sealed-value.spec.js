import { describe, expect, it } from 'vitest';

import { openValue, sealValue } from '../src/utils/sealed-value';

describe('sealed values', () => {
	const masterSecret = 'unit-test-master-secret-with-enough-entropy';

	it('round trips a value without exposing the plaintext', async () => {
		const sealed = await sealValue(masterSecret, 'xai-client-secret', 'client-secret-value');

		expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
		expect(sealed).not.toContain('client-secret-value');
		await expect(openValue(masterSecret, 'xai-client-secret', sealed)).resolves.toBe('client-secret-value');
	});

	it('rejects a modified ciphertext', async () => {
		const sealed = await sealValue(masterSecret, 'xai-client-secret', 'client-secret-value');
		const [version, iv, ciphertext] = sealed.split('.');
		const first = ciphertext[0];
		const tampered = `${version}.${iv}.${first === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;

		await expect(openValue(masterSecret, 'xai-client-secret', tampered)).rejects.toMatchObject({
			name: 'BizError',
		});
	});

	it('rejects a value opened for a different purpose', async () => {
		const sealed = await sealValue(masterSecret, 'xai-client-secret', 'client-secret-value');

		await expect(openValue(masterSecret, 'oauth-cookie', sealed)).rejects.toMatchObject({
			name: 'BizError',
		});
	});
});
