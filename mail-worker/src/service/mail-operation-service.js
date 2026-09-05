import BizError from '../error/biz-error';
import r2Service from './r2-service';

import { VERSION, mailOperationMigration } from '../migrations/mail-operations.mjs';
const now = () => new Date().toISOString();
const day = () => now().slice(0, 10);
const statement = (c, sql, ...values) => c.env.db.prepare(sql).bind(...values);

export async function migrateMailOperations(c) {
	await c.env.db.prepare('CREATE TABLE IF NOT EXISTS mail_schema_version (version INTEGER PRIMARY KEY)').run();
	const version = await statement(c, 'SELECT version FROM mail_schema_version WHERE version = ?', VERSION).first();
	if (version) {
		const { results } = await c.env.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('mail_operation','mail_daily_count','mail_object_cleanup')").all();
		if (results.length === 3) return;
	}
	const attachments = await c.env.db.prepare("PRAGMA table_info('attachments')").all();
	const users = await c.env.db.prepare("PRAGMA table_info('user')").all();
	const sql = mailOperationMigration(attachments.results, users.results);
	// D1 batch is transactional: version only advances if every migration statement succeeds.
	await c.env.db.batch(sql.map(sql => c.env.db.prepare(sql)));
}

export async function contentIdentity(value) {
	const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}

function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
	return value;
}

export async function sendFingerprint(params) {
	const { requestId, ...payload } = params;
	return contentIdentity(JSON.stringify(canonical(payload)));
}

export async function findSendOperation(c, userId, requestId, fingerprint) {
	if (typeof requestId !== 'string' || !/^[\w.-]{8,128}$/.test(requestId)) throw new BizError('A valid requestId is required', 400);
	const row = await statement(c, "SELECT * FROM mail_operation WHERE kind='send' AND user_id=? AND request_id=?", userId, requestId).first();
	if (row && row.fingerprint !== fingerprint) throw new BizError('requestId was already used for a different message', 409);
	return row;
}

export async function claimSendOperation(c, userId, requestId, fingerprint) {
	const operationId = crypto.randomUUID();
	await statement(c, `INSERT INTO mail_operation(operation_id,kind,user_id,request_id,fingerprint,state,created_at,updated_at)
		VALUES(?,'send',?,?,?,'preparing',?,?) ON CONFLICT(kind,user_id,request_id) DO NOTHING`, operationId, userId, requestId, fingerprint, now(), now()).run();
	const row = await findSendOperation(c, userId, requestId, fingerprint);
	return { ...row, owned: row.operation_id === operationId };
}

const emailFields = {
	sendEmail: 'send_email', name: 'name', subject: 'subject', content: 'content', text: 'text', code: 'code',
	accountId: 'account_id', userId: 'user_id', status: 'status', type: 'type', recipient: 'recipient', cc: 'cc', bcc: 'bcc',
	toEmail: 'to_email', toName: 'to_name', inReplyTo: 'in_reply_to', relation: 'relation', messageId: 'message_id', isDel: 'is_del',
};

export async function prepareOperationEmail(c, operationId, data) {
	const entries = Object.entries(data).filter(([key, value]) => emailFields[key] && value !== undefined);
	await c.env.db.batch([
		statement(c, `INSERT INTO email (${entries.map(([key]) => emailFields[key]).join(',')})
			SELECT ${entries.map(() => '?').join(',')} FROM mail_operation WHERE operation_id=? AND email_id IS NULL AND state='preparing'`, ...entries.map(([, value]) => value), operationId),
		statement(c, `UPDATE mail_operation SET email_id=last_insert_rowid(),updated_at=? WHERE operation_id=? AND email_id IS NULL AND changes()=1`, now(), operationId),
	]);
	return statement(c, 'SELECT * FROM mail_operation WHERE operation_id=?', operationId).first();
}

export async function reserveSendQuota(c, operationId, quantity, limit, daily = false) {
	const quotaDay = daily ? day() : null;
	const count = limit == null ? 0 : quantity;
	const base = daily ? "CASE WHEN send_count_day=? THEN send_count ELSE 0 END" : 'send_count';
	const values = daily ? [quotaDay, count, quotaDay, operationId, quotaDay, count, limit ?? Number.MAX_SAFE_INTEGER] : [count, operationId, count, limit ?? Number.MAX_SAFE_INTEGER];
	const results = await c.env.db.batch([
		statement(c, `UPDATE user SET send_count=(${base})+? ${daily ? ',send_count_day=?' : ''}
			WHERE user_id=(SELECT user_id FROM mail_operation WHERE operation_id=? AND state='preparing' AND email_id IS NOT NULL)
			AND (${base})+? <= ?`, ...values),
		statement(c, `UPDATE mail_operation SET state='dispatching',quota_count=?,quota_day=?,updated_at=?
			WHERE operation_id=? AND state='preparing' AND changes()=1 RETURNING operation_id`, count, quotaDay, now(), operationId),
	]);
	return results[1].results.length === 1;
}

export async function failSendOperation(c, operationId, error, definite = false) {
	if (!definite) {
		await statement(c, "UPDATE mail_operation SET state='uncertain',error=?,updated_at=? WHERE operation_id=? AND state='dispatching'", String(error).slice(0, 1000), now(), operationId).run();
		return;
	}
	await c.env.db.batch([
		statement(c, `UPDATE user SET send_count=MAX(0,send_count-(SELECT quota_count FROM mail_operation WHERE operation_id=?))
			WHERE user_id=(SELECT user_id FROM mail_operation WHERE operation_id=? AND state IN ('preparing','dispatching')
			AND (quota_day IS NULL OR quota_day=user.send_count_day))`, operationId, operationId),
		statement(c, `UPDATE email SET status=8,message=? WHERE email_id=(SELECT email_id FROM mail_operation WHERE operation_id=? AND state IN ('preparing','dispatching'))`, String(error).slice(0, 1000), operationId),
		statement(c, `UPDATE mail_operation SET state='failed',error=?,updated_at=? WHERE operation_id=? AND state IN ('preparing','dispatching')`, String(error).slice(0, 1000), now(), operationId),
	]);
}

export async function acceptSendOperation(c, operationId, providerId, status, quantity) {
	await c.env.db.batch([
		statement(c, `INSERT INTO mail_daily_count(day,send_count) SELECT substr(created_at,1,10),? FROM mail_operation WHERE operation_id=? AND state IN ('dispatching','uncertain')
			ON CONFLICT(day) DO UPDATE SET send_count=send_count+excluded.send_count`, quantity, operationId),
		statement(c, `UPDATE email SET status=?,resend_email_id=?,is_del=0 WHERE email_id=(SELECT email_id FROM mail_operation WHERE operation_id=? AND state IN ('dispatching','uncertain'))`, status, providerId ?? null, operationId),
		statement(c, `UPDATE mail_operation SET state='accepted',provider_id=?,updated_at=? WHERE operation_id=? AND state IN ('dispatching','uncertain')`, providerId ?? null, now(), operationId),
	]);
}

export async function daySendCount(c, date = day()) {
	const read = () => statement(c, 'SELECT send_count FROM mail_daily_count WHERE day=?', date).first();
	try {
		return Number((await read())?.send_count ?? 0);
	} catch (error) {
		// Older deployments may have the version marker without every table if a
		// migration was interrupted. Repair the additive schema on demand so the
		// analysis endpoint does not fail just because this optional counter is absent.
		if (!/no such table(?:\s*:\s*|\s+).*mail_daily_count/i.test(String(error?.message || error))) throw error;
		await migrateMailOperations(c);
		return Number((await read())?.send_count ?? 0);
	}
}

export async function deleteMailBatch(c, ids) {
	if (!ids.length) return;
	if (ids.length > 80) throw new Error('Mail deletion batch exceeds 80 IDs');
	const marks = ids.map(() => '?').join(',');
	const active = await statement(c, `SELECT email_id FROM email WHERE email_id IN (${marks}) AND status=6 LIMIT 1`, ...ids).first();
	if (active) throw new BizError('Mail is still being processed; retry deletion after recovery', 409);
	await c.env.db.batch([
		statement(c, `INSERT OR IGNORE INTO mail_object_cleanup(key) SELECT key FROM attachments WHERE email_id IN (${marks})`, ...ids),
		statement(c, `DELETE FROM star WHERE email_id IN (${marks})`, ...ids),
		statement(c, `DELETE FROM attachments WHERE email_id IN (${marks})`, ...ids),
		statement(c, `DELETE FROM email WHERE email_id IN (${marks})`, ...ids),
	]);
}

export async function recoverObjectCleanup(c, limit = 50) {
	const rows = await statement(c, `SELECT key,attempts FROM mail_object_cleanup WHERE next_attempt<=? ORDER BY next_attempt LIMIT ?`, now(), Math.min(100, Math.max(1, limit))).all();
	for (const row of rows.results) {
		// New uploads use operation-scoped keys; referenced legacy/shared objects must survive.
		if (await statement(c, 'SELECT att_id FROM attachments WHERE key=? LIMIT 1', row.key).first()) {
			await statement(c, 'DELETE FROM mail_object_cleanup WHERE key=?', row.key).run();
			continue;
		}
		try {
			await r2Service.delete(c, [row.key]);
			await statement(c, 'DELETE FROM mail_object_cleanup WHERE key=?', row.key).run();
		} catch (error) {
			const retry = new Date(Date.now() + Math.min(86400000, 60000 * 2 ** Math.min(row.attempts, 10))).toISOString();
			await statement(c, 'UPDATE mail_object_cleanup SET attempts=attempts+1,next_attempt=?,error=? WHERE key=?', retry, String(error).slice(0, 1000), row.key).run();
		}
	}
}

export async function recoverMailOperations(c) {
	await recoverObjectCleanup(c);
	const { recoverReceives } = await import('./receive-operation-service');
	await recoverReceives(c);
}
