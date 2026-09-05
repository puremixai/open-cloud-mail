import PostalMime from 'postal-mime';
import { contentIdentity, prepareOperationEmail } from './mail-operation-service';
import attService from './att-service';
import emailService from './email-service';
import r2Service from './r2-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const query = (c, sql, ...values) => c.env.db.prepare(sql).bind(...values);

async function claimReceive(c, operation) {
	const token = crypto.randomUUID();
	// Longer than the maximum scheduled-event duration; an interrupted worker cannot overlap its replacement.
	const until = new Date(Date.now() + 20 * 60000).toISOString();
	const result = await query(c, `UPDATE mail_operation SET lease_token=?,lease_until=? WHERE operation_id=? AND state='preparing'
		AND (lease_until IS NULL OR lease_until<?)
		AND ((CAST(json_extract(payload,'$.params.accountId') AS INTEGER)=0 AND CAST(json_extract(payload,'$.params.userId') AS INTEGER)=0)
			OR EXISTS(SELECT 1 FROM account a JOIN user u ON u.user_id=a.user_id
				WHERE a.account_id=CAST(json_extract(payload,'$.params.accountId') AS INTEGER)
				AND a.user_id=CAST(json_extract(payload,'$.params.userId') AS INTEGER)))
		RETURNING operation_id`, token, until, operation.operation_id, new Date().toISOString()).all();
	return result.results.length ? { ...operation, lease_token: token } : null;
}

export async function receiveOperation(c, raw, to, params, r2Domain) {
	const accountId = Number(params.accountId), userId = Number(params.userId);
	if (!Number.isSafeInteger(accountId) || !Number.isSafeInteger(userId) || accountId < 0 || userId < 0) {
		throw new BizError('Recipient ownership is invalid; retry delivery', 503);
	}
	params = { ...params, accountId, userId };
	const identity = await contentIdentity(`${to}\0${await contentIdentity(raw)}`);
	const operationId = `receive-${identity}`;
	const timestamp = new Date().toISOString();
	await query(c, `INSERT INTO mail_operation(operation_id,kind,user_id,request_id,fingerprint,state,raw_key,envelope_to,created_at,updated_at,payload)
		SELECT ?,'receive',0,?,?,'preparing',?,?,?,?,?
		WHERE (?=0 AND ?=0) OR EXISTS(SELECT 1 FROM account a JOIN user u ON u.user_id=a.user_id WHERE a.account_id=? AND a.user_id=?)
		ON CONFLICT(kind,user_id,request_id) DO NOTHING`,
		operationId, identity, identity, `mail-raw/${identity}.eml`, to, timestamp, timestamp, JSON.stringify({ params, r2Domain }),
		accountId, userId, accountId, userId).run();
	let operation = await query(c, 'SELECT * FROM mail_operation WHERE operation_id=?', operationId).first();
	if (!operation) throw new BizError('Recipient ownership changed; retry the original delivery', 503);
	if (operation.state === 'complete') return null;
	operation = await claimReceive(c, operation);
	if (!operation) throw new BizError('Receipt is already being processed; retry later', 503);
	try {
		await r2Service.putObj(c, operation.raw_key, raw, { contentType: 'message/rfc822' });
		return await finishReceive(c, operation, raw);
	} catch (error) {
		await recordFailure(c, operation, error);
		throw error;
	}
}

async function recordFailure(c, operation, error) {
	await query(c, "UPDATE mail_operation SET error=?,updated_at=?,lease_token=NULL,lease_until=NULL WHERE operation_id=? AND state='preparing' AND lease_token=?", String(error).slice(0, 1000), new Date().toISOString(), operation.operation_id, operation.lease_token).run();
}

async function finishReceive(c, operation, raw) {
	const parsed = await PostalMime.parse(raw);
	const { params, r2Domain } = JSON.parse(operation.payload);
	const attachments = (parsed.attachments || []).map((item, index) => ({
		...item, key: `attachments/${operation.operation_id}/${index}`, operationSlot: String(index),
		size: item.content.byteLength ?? item.content.length,
	}));
	const data = { ...params, content: emailService.imgReplace(params.content, attachments.filter(item => item.contentId), r2Domain) };
	const prepared = await prepareOperationEmail(c, operation.operation_id, data);
	if (!prepared.email_id) throw new Error('Receive operation has no prepared email');
	await attService.addAtt(c, attachments.map(item => ({ ...item, emailId: prepared.email_id, accountId: params.accountId, userId: params.userId })));
	const results = await c.env.db.batch([
		query(c, `UPDATE email SET status=?,is_del=0 WHERE email_id=? AND status=6 AND EXISTS(SELECT 1 FROM mail_operation WHERE operation_id=? AND state='preparing')`,
			params.accountId ? emailConst.status.RECEIVE : emailConst.status.NOONE, prepared.email_id, operation.operation_id),
		query(c, `INSERT INTO mail_daily_count(day,receive_count) SELECT substr(created_at,1,10),1 FROM mail_operation WHERE operation_id=? AND state='preparing'
			ON CONFLICT(day) DO UPDATE SET receive_count=receive_count+1`, operation.operation_id),
		query(c, `INSERT OR IGNORE INTO mail_object_cleanup(key) SELECT raw_key FROM mail_operation WHERE operation_id=? AND raw_key IS NOT NULL`, operation.operation_id),
		query(c, `UPDATE mail_operation SET state='complete',payload=NULL,error=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE operation_id=? AND state='preparing' AND lease_token=? RETURNING email_id`, new Date().toISOString(), operation.operation_id, operation.lease_token),
	]);
	// Only the transaction which completes the receipt emits notifications.
	return results[3].results.length ? emailService.selectById(c, prepared.email_id) : null;
}

export async function recoverReceives(c, limit = 10) {
	const cutoff = new Date(Date.now() - 60000).toISOString();
	const { results } = await query(c, `SELECT * FROM mail_operation WHERE kind='receive' AND state='preparing' AND updated_at<? AND (lease_until IS NULL OR lease_until<?) ORDER BY updated_at LIMIT ?`, cutoff, new Date().toISOString(), Math.min(25, Math.max(1, limit))).all();
	for (const row of results) {
		const operation = await claimReceive(c, row);
		if (!operation) continue;
		try {
			const object = await r2Service.getObj(c, operation.raw_key);
			if (!object) throw new Error('Raw message archive unavailable; original delivery must retry');
			const raw = object instanceof ArrayBuffer || object instanceof Uint8Array ? object : await object.arrayBuffer();
			await finishReceive(c, operation, raw);
		} catch (error) {
			await recordFailure(c, operation, error);
		}
	}
}
