import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateMailOperations, daySendCount, recoverObjectCleanup, recoverMailOperations } from '../src/service/mail-operation-service';
import { localD1 } from './helpers/local-d1';
import emailService from '../src/service/email-service';
import attService from '../src/service/att-service';
import settingService from '../src/service/setting-service';
import userService from '../src/service/user-service';
import roleService from '../src/service/role-service';
import accountService from '../src/service/account-service';
import r2Service from '../src/service/r2-service';
import { email as receiveMail } from '../src/email/email';
import aiService from '../src/service/ai-service';
import oauthService from '../src/service/oauth-service';
import { receiveOperation } from '../src/service/receive-operation-service';

describe('durable mail reliability', () => {
	let c, params, objects, dispatches;
	beforeEach(async () => {
		c = { env: { db: localD1(), admin: 'admin@local.test', kv: { get: async () => null, put: async () => {} } } };
		await migrateMailOperations(c);
		objects = new Map(); dispatches = [];
		params = { requestId: 'request-0001', accountId: 1, receiveEmail: ['remote@example.net'], subject: 'hello', text: 'hello', content: '<p>hello</p>', attachments: [] };
		vi.spyOn(settingService, 'query').mockResolvedValue({ send: 0, resendTokens: {}, domainList: ['@local.test'], r2Domain: '' });
		vi.spyOn(userService, 'selectById').mockImplementation(async (_, id) => ({ userId: id, email: 'sender@local.test', type: 1, sendCount: 0 }));
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ sendCount: 2, sendType: 'count', availDomain: '*' });
		vi.spyOn(roleService, 'hasAvailDomainPerm').mockReturnValue(true);
		vi.spyOn(accountService, 'selectById').mockResolvedValue({ accountId: 1, userId: 1, email: 'sender@local.test' });
		vi.spyOn(r2Service, 'putObj').mockImplementation(async (_, key, content) => { objects.set(key, content); });
		vi.spyOn(r2Service, 'getObj').mockImplementation(async (_, key) => objects.get(key) ?? null);
		vi.spyOn(r2Service, 'delete').mockImplementation(async (_, keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key); });
		c.env.email = { send: async form => { dispatches.push(form); return { messageId: 'provider-1' }; } };
	});
	afterEach(() => { vi.restoreAllMocks(); c.env.db.sqlite.close(); });

	it('rejects too many attachments before provider acceptance', async () => {
		params.attachments = Array.from({ length: 11 }, () => ({ filename: 'a.txt', type: 'text/plain', content: 'YQ==' }));
		await expect(emailService.send(c, params, 1)).rejects.toThrow();
		expect(dispatches).toHaveLength(0);
	});
	it('persists prepared mail and attachments before any provider call', async () => {
		params.attachments = [{ filename: 'a.txt', type: 'text/plain', content: 'YQ==' }];
		c.env.email.send = async () => {
			expect(c.env.db.sqlite.prepare('SELECT status FROM email').get()).toEqual({ status: 6 });
			expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM attachments').get().n).toBe(1);
			expect(objects.size).toBe(1);
			return { messageId: 'provider-1' };
		};
		await emailService.send(c, params, 1);
	});
	it('never automatically dispatches the same client request twice', async () => {
		await emailService.send(c, params, 1);
		await emailService.send(c, params, 1);
		expect(dispatches).toHaveLength(1);
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM email').get().n).toBe(1);
	});
	it('reserves quota atomically against concurrent sends', async () => {
		await Promise.allSettled(Array.from({ length: 6 }, (_, i) => emailService.send(c, { ...params, requestId: `parallel-${i}` }, 1)));
		expect(dispatches).toHaveLength(2);
		expect(c.env.db.sqlite.prepare('SELECT send_count FROM user WHERE user_id=1').get().send_count).toBe(2);
	});
	it('never promotes incomplete receive rows from cron', async () => {
		c.env.db.sqlite.exec('INSERT INTO email(account_id,user_id,status,is_del) VALUES(1,1,6,1)');
		await emailService.completeReceiveAll(c);
		expect(c.env.db.sqlite.prepare('SELECT status,is_del FROM email').get()).toEqual({ status: 6, is_del: 1 });
	});
	it('deletes stars and attachment references with the same selected mails', async () => {
		c.env.db.sqlite.exec(`INSERT INTO email(account_id,user_id,subject) VALUES(1,1,'delete-me'),(1,1,'keep');
		INSERT INTO star VALUES(1,1,1),(2,1,2); INSERT INTO attachments(user_id,account_id,email_id,key) VALUES(1,1,1,'old');`);
		await emailService.batchDelete(c, { subject: 'delete-me' });
		expect(c.env.db.sqlite.prepare('SELECT email_id FROM email').all()).toEqual([{ email_id: 2 }]);
		expect(c.env.db.sqlite.prepare('SELECT email_id FROM star').all()).toEqual([{ email_id: 2 }]);
	});
	it('reuses attachment rows and uploads safely after partial failure', async () => {
		const atts = [0, 1].map(i => ({ emailId: 1, userId: 1, accountId: 1, key: `attachments/op/${i}`, operationSlot: String(i), content: new Uint8Array([i]), filename: `${i}.txt` }));
		r2Service.putObj.mockRejectedValueOnce(new Error('storage down'));
		await expect(attService.addAtt(c, atts)).rejects.toThrow('storage down');
		await attService.addAtt(c, atts);
		await attService.addAtt(c, atts);
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM attachments').get().n).toBe(2);
		expect(objects.size).toBe(2);
	});
	it('converts owned signed inline URLs to CID and rejects another user’s object', async () => {
		c.req = { url: 'https://mail.test/api/email/send' };
		c.env.db.sqlite.exec(`INSERT INTO attachments(user_id,account_id,email_id,key,filename,mime_type,size) VALUES(1,1,1,'attachments/owned.png','a.png','image/png',1),(2,2,2,'attachments/private.png','b.png','image/png',1)`);
		objects.set('attachments/owned.png', new Uint8Array([1]).buffer);
		const result = await attService.toImageUrlHtml(c, '<img src="https://mail.test/api/oss/attachments/owned.png?token=secret">', 1);
		expect(result.html).toContain('cid:');
		expect(result.html).not.toContain('token=');
		expect(result.imageDataList).toHaveLength(1);
		await expect(attService.toImageUrlHtml(c, '<img src="https://mail.test/api/oss/attachments/private.png?token=secret">', 1)).rejects.toThrow();
	});
	it('retains ambiguous provider operations and quota across retries', async () => {
		c.env.email.send = async () => { dispatches.push('accepted-then-timeout'); throw new Error('timeout'); };
		await expect(emailService.send(c, params, 1)).rejects.toThrow();
		await expect(emailService.send(c, params, 1)).rejects.toThrow();
		expect(dispatches).toHaveLength(1);
		expect(c.env.db.sqlite.prepare('SELECT state FROM mail_operation').get().state).toBe('uncertain');
		expect(c.env.db.sqlite.prepare('SELECT send_count FROM user WHERE user_id=1').get().send_count).toBe(1);
	});
	it('retains durable cleanup after object deletion failure', async () => {
		c.env.db.sqlite.exec(`INSERT INTO email(account_id,user_id) VALUES(1,1); INSERT INTO attachments(user_id,account_id,email_id,key) VALUES(1,1,1,'attachments/old')`);
		objects.set('attachments/old', 'data');
		r2Service.delete.mockRejectedValueOnce(new Error('storage down'));
		await emailService.physicsDelete(c, { emailIds: '1' });
		expect(c.env.db.sqlite.prepare('SELECT key,attempts FROM mail_object_cleanup').get()).toEqual({ key: 'attachments/old', attempts: 1 });
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM attachments').get().n).toBe(0);
	});
	it('keeps failed MIME receipt recoverable and deduplicates retries by bytes and recipient', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(accountService, 'selectByEmailIncludeDel').mockResolvedValue({ accountId: 1, userId: 1 });
		vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue({ email: c.env.admin });
		vi.spyOn(aiService, 'extractCode').mockResolvedValue('');
		const raw = new TextEncoder().encode('From: Sender <sender@example.net>\r\nTo: sender@local.test\r\nMessage-ID: <stable@example.net>\r\nSubject: retry\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="test"\r\n\r\n--test\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n你好\r\n--test\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename="a.txt"\r\nContent-Transfer-Encoding: base64\r\n\r\nYQ==\r\n--test--\r\n');
		const message = () => ({ to: 'sender@local.test', raw: new ReadableStream({ start(controller) { controller.enqueue(raw.slice(0, 350)); controller.enqueue(raw.slice(350)); controller.close(); } }), setReject: vi.fn(), forward: vi.fn() });
		let fail = true;
		r2Service.putObj.mockImplementation(async (_, key, content) => { if (key.startsWith('attachments/') && fail) { fail = false; throw new Error('attachment unavailable'); } objects.set(key, content); });
		await expect(receiveMail(message(), c.env, {})).rejects.toThrow('attachment unavailable');
		expect(c.env.db.sqlite.prepare('SELECT status FROM email').get().status).toBe(6);
		expect([...objects.keys()].some(key => key.startsWith('mail-raw/'))).toBe(true);
		// Recovery can finish from durable raw bytes without another SMTP delivery.
		c.env.db.sqlite.exec("UPDATE mail_operation SET updated_at='2000-01-01'");
		await recoverMailOperations(c);
		await receiveMail(message(), c.env, {});
		expect(c.env.db.sqlite.prepare('SELECT status,text FROM email').all()).toEqual([{ status: 0, text: '你好\n' }]);
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM attachments').get().n).toBe(1);
		expect(c.env.db.sqlite.prepare('SELECT receive_count FROM mail_daily_count').get().receive_count).toBe(1);
		await recoverObjectCleanup(c);
		expect([...objects.keys()].some(key => key.startsWith('mail-raw/'))).toBe(false);
		expect(c.env.db.sqlite.prepare('SELECT payload FROM mail_operation').get().payload).toBeNull();
	});
	it('does not report provider responses without an acceptance id as success', async () => {
		c.env.email.send = async () => { dispatches.push('unknown'); return {}; };
		await expect(emailService.send(c, params, 1)).rejects.toThrow();
		await expect(emailService.send(c, params, 1)).rejects.toThrow();
		expect(dispatches).toHaveLength(1);
	});
	it('refunds only definite provider rejection and permits a new request', async () => {
		delete c.env.email;
		settingService.query.mockResolvedValue({ send: 0, resendTokens: { 'local.test': 'fake' }, domainList: ['@local.test'], r2Domain: '' });
		vi.spyOn(emailService, 'sendByResend').mockResolvedValue({ error: { statusCode: 422, message: 'invalid sender' } });
		await expect(emailService.send(c, params, 1)).rejects.toThrow();
		expect(c.env.db.sqlite.prepare('SELECT send_count FROM user WHERE user_id=1').get().send_count).toBe(0);
		expect(c.env.db.sqlite.prepare('SELECT state FROM mail_operation').get().state).toBe('failed');
	});
	it('counts accepted recipients atomically and once per request', async () => {
		await Promise.all([emailService.send(c, params, 1), emailService.send(c, { ...params, requestId: 'request-0002' }, 1)]);
		await emailService.send(c, params, 1);
		expect(await daySendCount(c)).toBe(2);
	});
	it('blocks a reused requestId with changed content', async () => {
		await emailService.send(c, params, 1);
		await expect(emailService.send(c, { ...params, subject: 'changed' }, 1)).rejects.toThrow('different message');
		expect(dispatches).toHaveLength(1);
	});
	it('migration is repeatable and does not mark a failed batch applied', async () => {
		await migrateMailOperations(c);
		c.env.db.sqlite.exec('DELETE FROM mail_schema_version');
		const batch = vi.spyOn(c.env.db, 'batch').mockRejectedValueOnce(new Error('D1 migration failed'));
		await expect(migrateMailOperations(c)).rejects.toThrow('D1 migration failed');
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM mail_schema_version').get().n).toBe(0);
		batch.mockRestore();
		await migrateMailOperations(c);
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM mail_schema_version').get().n).toBe(1);
	});
	it('retries durable object cleanup but keeps objects referenced by another mail', async () => {
		c.env.db.sqlite.exec(`INSERT INTO mail_object_cleanup(key) VALUES('unreferenced'),('shared'); INSERT INTO attachments(user_id,email_id,account_id,key) VALUES(1,1,1,'shared')`);
		objects.set('shared', 'keep'); objects.set('unreferenced', 'delete');
		await recoverObjectCleanup(c);
		expect([...objects.keys()]).toEqual(['shared']);
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM mail_object_cleanup').get().n).toBe(0);
	});
	it('daily quota reset does not erase reservations made after midnight', async () => {
		vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T00:15:00Z'));
		roleService.selectById.mockResolvedValue({ sendCount: 2, sendType: 'day' });
		vi.spyOn(roleService, 'selectByIdsAndSendType').mockResolvedValue([{ roleId: 1 }]);
		try {
			await emailService.send(c, params, 1);
			await userService.resetDaySendCount(c);
			expect(c.env.db.sqlite.prepare('SELECT send_count FROM user WHERE user_id=1').get().send_count).toBe(1);
		} finally { vi.useRealTimers(); }
	});
	it('keeps legacy sends without a requestId working', async () => {
		delete params.requestId;
		await emailService.send(c, params, 1);
		expect(dispatches).toHaveLength(1);
	});
	it('serializes concurrent receive recovery so cleanup cannot race an old uploader', async () => {
		let release, started;
		const blocked = new Promise(resolve => { release = resolve; });
		const ready = new Promise(resolve => { started = resolve; });
		let first = true;
		r2Service.putObj.mockImplementation(async (_, key, content) => { if (first) { first = false; started(); await blocked; } objects.set(key, content); });
		const raw = new TextEncoder().encode('From: a@example.net\r\nTo: sender@local.test\r\n\r\nbody');
		const data = { userId: 1, accountId: 1, status: 6, isDel: 1, text: 'body' };
		const pending = receiveOperation(c, raw, 'sender@local.test', data, '');
		await ready;
		try { await expect(receiveOperation(c, raw, 'sender@local.test', data, '')).rejects.toThrow(); }
		finally { release(); await pending; }
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM email').get().n).toBe(1);
	});
	it('skips total-count SQL only when includeTotal is explicitly zero', async () => {
		c.env.db.sqlite.exec(`INSERT INTO email(account_id,user_id) VALUES(1,1),(1,1)`);
		const prepare = vi.spyOn(c.env.db, 'prepare');
		const result = await emailService.list(c, { accountId: 1, type: 0, size: 1, allReceive: 0, includeTotal: '0' }, 1);
		expect(result.total).toBeNull();
		expect(prepare.mock.calls.some(([sql]) => /count\(/i.test(sql))).toBe(false);
		expect((await emailService.list(c, { accountId: 1, type: 0, size: 1, allReceive: 0 }, 1)).total).toBe(2);
		expect((await emailService.allList(c, { size: 1, includeTotal: 0 })).total).toBeNull();
	});
	it('keeps provider attachments free of local persistence fields', async () => {
		const result = await emailService.toResendAttachments([{ filename: 'a.txt', content: new Uint8Array([97]), buff: new Uint8Array([97]), key: 'private-key', mimeType: 'text/plain' }]);
		expect(result).toEqual([{ filename: 'a.txt', content: 'YQ==', contentType: 'text/plain' }]);
	});
	it('preserves inline attachment references for internal recipients', async () => {
		c.env.db.sqlite.exec("ALTER TABLE account ADD COLUMN name TEXT; ALTER TABLE account ADD COLUMN status INTEGER; ALTER TABLE account ADD COLUMN latest_email_time TEXT; ALTER TABLE account ADD COLUMN create_time TEXT; ALTER TABLE account ADD COLUMN all_receive INTEGER; ALTER TABLE account ADD COLUMN sort INTEGER;");
		vi.spyOn(roleService, 'selectByUserIds').mockResolvedValue([{ userId: 1, banEmail: '', availDomain: '*' }]);
		vi.spyOn(roleService, 'isBanEmail').mockReturnValue(false);
		params.receiveEmail = ['sender@local.test'];
		params.content = '<img src="data:image/png;base64,YQ==">';
		await emailService.send(c, params, 1);
		const rows = c.env.db.sqlite.prepare('SELECT email_id,type FROM attachments ORDER BY email_id').all();
		expect(rows).toEqual([{ email_id: 1, type: 1 }, { email_id: 2, type: 1 }]);
		expect(dispatches).toHaveLength(0);
	});
	it('does not delete an account’s rows while a receipt is still saving', async () => {
		c.env.db.sqlite.exec('INSERT INTO email(account_id,user_id,status,is_del) VALUES(1,1,6,1)');
		await expect(emailService.physicsDeleteByAccountId(c, 1)).rejects.toThrow();
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM email').get().n).toBe(1);
	});
	it('keeps accepted-provider ambiguity durable if the final local commit fails', async () => {
		const batch = c.env.db.batch.bind(c.env.db);
		c.env.db.batch = async statements => {
			if (dispatches.length) throw new Error('local commit failed');
			return batch(statements);
		};
		await expect(emailService.send(c, params, 1)).rejects.toThrow('local commit failed');
		await expect(emailService.send(c, params, 1)).rejects.toThrow();
		expect(dispatches).toHaveLength(1);
		expect(c.env.db.sqlite.prepare('SELECT send_count FROM user WHERE user_id=1').get().send_count).toBe(1);
	});
	it('does not delete matching messages inserted after the fixed batch was selected', async () => {
		c.env.db.sqlite.exec("INSERT INTO email(account_id,user_id,subject) VALUES(1,1,'delete-me')");
		const batch = c.env.db.batch.bind(c.env.db);
		let inserted = false;
		c.env.db.batch = async statements => {
			if (!inserted) { inserted = true; c.env.db.sqlite.exec("INSERT INTO email(account_id,user_id,subject) VALUES(1,1,'delete-me'); INSERT INTO star VALUES(2,1,2)"); }
			return batch(statements);
		};
		await emailService.batchDelete(c, { subject: 'delete-me' });
		expect(c.env.db.sqlite.prepare('SELECT email_id FROM email').all()).toEqual([{ email_id: 2 }]);
		expect(c.env.db.sqlite.prepare('SELECT email_id FROM star').all()).toEqual([{ email_id: 2 }]);
	});
	it('preserves legacy same-day quota when installing the migration', async () => {
		c.env.db.sqlite.exec("DELETE FROM mail_schema_version; UPDATE user SET send_count=2,send_count_day='' WHERE user_id=1");
		await migrateMailOperations(c);
		roleService.selectById.mockResolvedValue({ sendCount: 2, sendType: 'day' });
		await expect(emailService.send(c, params, 1)).rejects.toThrow();
		expect(dispatches).toHaveLength(0);
		expect(c.env.db.sqlite.prepare('SELECT send_count FROM user WHERE user_id=1').get().send_count).toBe(2);
	});
	it('returns explicit safe-retry 424 for a failed staging operation and its unchanged retry', async () => {
		params.attachments = [{ filename: 'a.txt', type: 'text/plain', content: 'YQ==' }];
		r2Service.putObj.mockRejectedValueOnce(new Error('storage unavailable'));
		await expect(emailService.send(c, params, 1)).rejects.toMatchObject({ code: 424 });
		await expect(emailService.send(c, params, 1)).rejects.toMatchObject({ code: 424 });
		await emailService.send(c, { ...params, requestId: 'new-attempt-1' }, 1);
		expect(dispatches).toHaveLength(1);
	});
	it('does not expose an internal receipt when its attachment transaction fails', async () => {
		c.env.db.sqlite.exec("ALTER TABLE account ADD COLUMN name TEXT; ALTER TABLE account ADD COLUMN status INTEGER; ALTER TABLE account ADD COLUMN latest_email_time TEXT; ALTER TABLE account ADD COLUMN create_time TEXT; ALTER TABLE account ADD COLUMN all_receive INTEGER; ALTER TABLE account ADD COLUMN sort INTEGER;");
		c.env.db.sqlite.exec("CREATE TRIGGER fail_internal_att BEFORE INSERT ON attachments WHEN NEW.email_id<>1 BEGIN SELECT RAISE(ABORT,'attachment insert failed'); END;");
		vi.spyOn(roleService, 'selectByUserIds').mockResolvedValue([{ userId: 1, banEmail: '', availDomain: '*' }]);
		vi.spyOn(roleService, 'isBanEmail').mockReturnValue(false);
		params.receiveEmail = ['sender@local.test'];
		params.attachments = [{ filename: 'a.txt', type: 'text/plain', content: 'YQ==' }];
		await expect(emailService.send(c, params, 1)).rejects.toThrow();
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM email WHERE type=0').get().n).toBe(0);
	});
	it('protects account and user deletion when archived receipt preparation has no email row yet', async () => {
		c.env.db.sqlite.exec("CREATE TRIGGER fail_email_prepare BEFORE INSERT ON email BEGIN SELECT RAISE(ABORT,'D1 email preparation failed'); END; INSERT INTO star VALUES(1,1,123)");
		const raw = new TextEncoder().encode('From: a@example.net\r\nTo: sender@local.test\r\n\r\nbody');
		await expect(receiveOperation(c, raw, 'sender@local.test', { userId: 1, accountId: 1, status: 6, isDel: 1, text: 'body' }, '')).rejects.toThrow();
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM email').get().n).toBe(0);
		expect([...objects.keys()].some(key => key.startsWith('mail-raw/'))).toBe(true);
		await expect(accountService.physicsDelete(c, { accountId: '1' })).rejects.toMatchObject({ code: 409 });
		await expect(userService.physicsDelete(c, { userIds: '1' })).rejects.toMatchObject({ code: 409 });
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM account').get().n).toBe(1);
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM star').get().n).toBe(1);
		await expect(emailService.physicsDeleteByAccountId(c, '2')).resolves.toBeUndefined();
	});

	it.each(['preparing', 'complete'])('atomically blocks account deletion when a %s receipt arrives after the initial guards', async state => {
		if (state === 'preparing') c.env.db.sqlite.exec("CREATE TRIGGER fail_prepare BEFORE INSERT ON email BEGIN SELECT RAISE(ABORT,'prepare failed'); END");
		const raw = new TextEncoder().encode('From: a@example.net\r\n\r\ninterleaved');
		const data = { userId: 1, accountId: 1, status: 6, isDel: 1, text: 'interleaved' };
		const cleanup = emailService.physicsDeleteByAccountId.bind(emailService);
		vi.spyOn(emailService, 'physicsDeleteByAccountId').mockImplementation(async (...args) => {
			await cleanup(...args);
			if (state === 'preparing') await expect(receiveOperation(c, raw, 'sender@local.test', data, '')).rejects.toThrow('prepare failed');
			else await receiveOperation(c, raw, 'sender@local.test', data, '');
		});
		await expect(accountService.physicsDelete(c, { accountId: '1' })).rejects.toMatchObject({ code: 409 });
		expect(c.env.db.sqlite.prepare('SELECT user_id FROM account WHERE account_id=1').get().user_id).toBe(1);
		expect(c.env.db.sqlite.prepare('SELECT state FROM mail_operation').get().state).toBe(state);
		if (state === 'preparing') {
			c.env.db.sqlite.exec("DROP TRIGGER fail_prepare; UPDATE mail_operation SET updated_at='2000-01-01'");
			await recoverMailOperations(c);
			expect(c.env.db.sqlite.prepare('SELECT status FROM email').get().status).toBe(0);
		}
	});

	it('atomically blocks bulk account/user deletion when a receipt arrives after the initial guards', async () => {
		c.env.db.sqlite.exec("CREATE TRIGGER fail_prepare BEFORE INSERT ON email BEGIN SELECT RAISE(ABORT,'prepare failed'); END");
		const cleanup = emailService.physicsDeleteUserIds.bind(emailService);
		vi.spyOn(emailService, 'physicsDeleteUserIds').mockImplementation(async (...args) => {
			await cleanup(...args);
			await expect(receiveOperation(c, new TextEncoder().encode('From: a@example.net\r\n\r\nbody'), 'sender@local.test', { userId: 1, accountId: 1, status: 6 }, '')).rejects.toThrow('prepare failed');
		});
		vi.spyOn(oauthService, 'deleteByUserIds').mockResolvedValue(undefined);
		await expect(userService.physicsDelete(c, { userIds: '1' })).rejects.toMatchObject({ code: 409 });
		expect(c.env.db.sqlite.prepare('SELECT user_id FROM account WHERE account_id=1').get().user_id).toBe(1);
		expect(c.env.db.sqlite.prepare('SELECT user_id FROM user WHERE user_id=1').get().user_id).toBe(1);
	});

	it.each(['account', 'user'])('rejects stale receive claims if %s deletion commits first', async owner => {
		vi.spyOn(oauthService, 'deleteByUserIds').mockResolvedValue(undefined);
		if (owner === 'account') await accountService.physicsDelete(c, { accountId: '1' });
		else await userService.physicsDelete(c, { userIds: '1' });
		await expect(receiveOperation(c, new TextEncoder().encode('From: a@example.net\r\n\r\nstale'), 'sender@local.test', { userId: 1, accountId: 1, status: 6 }, '')).rejects.toMatchObject({ code: 503 });
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM mail_operation').get().n).toBe(0);
		expect(c.env.db.sqlite.prepare('SELECT count(*) AS n FROM email').get().n).toBe(0);
		expect(objects.size).toBe(0);
	});

	it('atomically guards final user deletion when new account receipt appears after account cleanup', async () => {
		c.env.db.sqlite.exec("CREATE TRIGGER fail_prepare BEFORE INSERT ON email BEGIN SELECT RAISE(ABORT,'prepare failed'); END");
		vi.spyOn(oauthService, 'deleteByUserIds').mockImplementation(async () => {
			// Another operation creates an account while the user still exists, after old accounts were removed.
			c.env.db.sqlite.exec("INSERT INTO account VALUES(3,1,'new@local.test',0)");
			await expect(receiveOperation(c, new TextEncoder().encode('From: a@example.net\r\n\r\nnew'), 'new@local.test', { userId: 1, accountId: 3, status: 6 }, '')).rejects.toThrow('prepare failed');
		});
		await expect(userService.physicsDelete(c, { userIds: '1' })).rejects.toMatchObject({ code: 409 });
		expect(c.env.db.sqlite.prepare('SELECT user_id FROM user WHERE user_id=1').get().user_id).toBe(1);
	});

	it('still accepts NOONE receipts without an owner account or user', async () => {
		const result = await receiveOperation(c, new TextEncoder().encode('From: a@example.net\r\n\r\nnoone'), 'absent@local.test', { userId: 0, accountId: 0, status: 6 }, '');
		expect(result).toMatchObject({ accountId: 0, userId: 0, status: 7 });
	});
});
