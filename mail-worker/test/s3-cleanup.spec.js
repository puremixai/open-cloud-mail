import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { migrateMailOperations, recoverObjectCleanup } from '../src/service/mail-operation-service';
import s3Service from '../src/service/s3-service';
import settingService from '../src/service/setting-service';

describe('S3 per-object deletion failures', () => {
	let c, send;
	beforeEach(async () => {
		c = { env: { db: localD1() } };
		await migrateMailOperations(c);
		vi.spyOn(settingService, 'query').mockResolvedValue({ bucket: 'test', endpoint: 'storage.invalid', s3AccessKey: 'test', s3SecretKey: 'test' });
		send = vi.fn().mockResolvedValue({ $metadata: { httpStatusCode: 200 }, Errors: [{ Key: 'attachments/blocked', Code: 'AccessDenied', Message: 'permission denied' }] });
		vi.spyOn(s3Service, 'client').mockResolvedValue({ send, middlewareStack: { add() {} } });
	});
	afterEach(() => { vi.restoreAllMocks(); c.env.db.sqlite.close(); });

	it('rejects HTTP 200 DeleteObjects responses with failed objects', async () => {
		await expect(s3Service.deleteObj(c, ['attachments/blocked'])).rejects.toThrow('AccessDenied');
	});
	it('keeps the cleanup record until S3 confirms the failed key can be deleted', async () => {
		c.env.db.sqlite.exec("INSERT INTO mail_object_cleanup(key) VALUES('attachments/blocked')");
		await recoverObjectCleanup(c);
		expect(c.env.db.sqlite.prepare('SELECT key,attempts,error FROM mail_object_cleanup').get()).toMatchObject({ key: 'attachments/blocked', attempts: 1, error: expect.stringContaining('AccessDenied') });
		c.env.db.sqlite.exec("UPDATE mail_object_cleanup SET next_attempt=''");
		send.mockResolvedValue({ $metadata: { httpStatusCode: 200 }, Deleted: [{ Key: 'attachments/blocked' }] });
		await recoverObjectCleanup(c);
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM mail_object_cleanup').get().n).toBe(0);
	});
});
