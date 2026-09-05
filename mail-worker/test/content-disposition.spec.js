import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { migrateMailOperations } from '../src/service/mail-operation-service';
import attService from '../src/service/att-service';
import kvObjService from '../src/service/kv-obj-service';
import s3Service from '../src/service/s3-service';
import r2Service from '../src/service/r2-service';
import settingService from '../src/service/setting-service';
import objectAccessService from '../src/service/object-access-service';
import jwtUtils from '../src/utils/jwt-utils';

function expectDownloadName(disposition, name) {
	expect(disposition).toMatch(/^[\x20-\x7e]+$/);
	expect(() => new Headers({ 'Content-Disposition': disposition })).not.toThrow();
	expect(disposition).toMatch(/filename="[^"]+"/);
	const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
	expect(encoded).toBeTruthy();
	expect(decodeURIComponent(encoded)).toBe(name.replace(/[\x00-\x1f\x7f]/g, ''));
}

describe('safe attachment Content-Disposition', () => {
	let c;
	const key = 'attachments/0123456789abcdef0123456789abcdef.txt';
	beforeEach(async () => {
		c = { env: { db: localD1(), jwt_secret: 'test-only-secret' } };
		await migrateMailOperations(c);
		vi.spyOn(settingService, 'query').mockResolvedValue({ bucket: 'local-only' });
	});
	afterEach(() => { vi.restoreAllMocks(); c.env.db.sqlite.close(); });

	it.each(['季度报告.txt', 'report "v2".txt', '报告\r\nX-Test: injected.txt'])('encodes new upload metadata for %j', async filename => {
		let metadata;
		vi.spyOn(r2Service, 'putObj').mockImplementation(async (_, __, ___, value) => { metadata = value; });
		await attService.addAtt(c, [{ userId: 1, accountId: 1, emailId: 1, key, filename, content: new Uint8Array([97]) }]);
		expectDownloadName(metadata.contentDisposition, filename);
	});

	it.each(['季度报告.txt', 'report "v2".txt', '报告\r\nX-Test: injected.txt'])('normalizes legacy KV metadata for %j', async filename => {
		c.env.kv = { getWithMetadata: async () => ({ value: new Uint8Array([97]).buffer, metadata: { contentDisposition: `attachment;filename=${filename}` } }) };
		const response = await kvObjService.getObj(c, key);
		expectDownloadName(response.headers.get('Content-Disposition'), filename);
		expect(response.headers.has('X-Test')).toBe(false);
		expect(await response.text()).toBe('a');
	});

	it.each(['季度报告.txt', 'report "v2".txt', '报告\r\nX-Test: injected.txt'])('normalizes legacy S3 metadata for %j', async filename => {
		vi.spyOn(s3Service, 'client').mockResolvedValue({ send: async () => ({ Body: 'a', ContentDisposition: `attachment;filename=${filename}` }) });
		const response = await s3Service.getObj(c, key);
		expectDownloadName(response.headers.get('Content-Disposition'), filename);
		expect(response.headers.has('X-Test')).toBe(false);
		expect(await response.text()).toBe('a');
	});

	it.each(['季度报告.txt', 'report "v2".txt', '报告\r\nX-Test: injected.txt'])('normalizes legacy R2 metadata before constructing Headers for %j', async filename => {
		vi.spyOn(r2Service, 'getObj').mockResolvedValue({ body: 'a', httpMetadata: { contentType: 'text/plain', contentDisposition: `inline;filename=${filename}` } });
		const token = await jwtUtils.generateToken(c, { purpose: 'attachment', key }, 900);
		const response = await objectAccessService.response(c, key, token);
		expectDownloadName(response.headers.get('Content-Disposition'), filename);
		expect(response.headers.get('Content-Disposition')).toMatch(/^attachment;/);
		expect(response.headers.has('X-Test')).toBe(false);
		expect(await response.text()).toBe('a');
	});

	it('preserves UTF-8 filename* and quoted escaped legacy filenames', async () => {
		for (const [header, expected] of [
			['attachment; filename="fallback.txt"; filename*=UTF-8\'\'%E6%8A%A5%E5%91%8A.txt', '报告.txt'],
			['attachment; filename="report \\"v2\\".txt"', 'report "v2".txt'],
		]) {
			c.env.kv = { getWithMetadata: async () => ({ value: new Uint8Array([97]).buffer, metadata: { contentDisposition: header } }) };
			expectDownloadName((await kvObjService.getObj(c, key)).headers.get('Content-Disposition'), expected);
		}
	});
});
