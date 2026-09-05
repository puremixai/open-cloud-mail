export const VERSION = 1;

export function mailOperationMigration(attachmentColumns, userColumns) {
	const sql = [
		`CREATE TABLE IF NOT EXISTS mail_operation (
			operation_id TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id INTEGER NOT NULL, request_id TEXT NOT NULL,
			fingerprint TEXT NOT NULL, state TEXT NOT NULL, email_id INTEGER, raw_key TEXT, envelope_to TEXT, payload TEXT, lease_token TEXT, lease_until TEXT,
			quota_count INTEGER NOT NULL DEFAULT 0, quota_day TEXT, provider_id TEXT, error TEXT,
			created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(kind,user_id,request_id))`,
		`CREATE TABLE IF NOT EXISTS mail_daily_count (day TEXT PRIMARY KEY, send_count INTEGER NOT NULL DEFAULT 0, receive_count INTEGER NOT NULL DEFAULT 0)`,
		`CREATE TABLE IF NOT EXISTS mail_object_cleanup (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, next_attempt TEXT NOT NULL DEFAULT '', error TEXT)`,
		`CREATE INDEX IF NOT EXISTS idx_mail_operation_recovery ON mail_operation(kind,state,updated_at)`,
		`CREATE INDEX IF NOT EXISTS idx_mail_object_cleanup_due ON mail_object_cleanup(next_attempt)`,
		`CREATE INDEX IF NOT EXISTS idx_attachments_key ON attachments(key)`,
	];
	if (!attachmentColumns.some(row => row.name === 'operation_slot')) sql.push('ALTER TABLE attachments ADD COLUMN operation_slot TEXT');
	if (!userColumns.some(row => row.name === 'send_count_day')) sql.push("ALTER TABLE user ADD COLUMN send_count_day TEXT NOT NULL DEFAULT ''");
	// Preserve quota already consumed on deployment day. UTC also governs reservations and cron reset.
	sql.push("UPDATE user SET send_count_day=date('now') WHERE send_count_day=''");
	sql.push('CREATE UNIQUE INDEX IF NOT EXISTS idx_attachment_operation_slot ON attachments(email_id,operation_slot)');
	sql.push(`INSERT OR IGNORE INTO mail_schema_version(version) VALUES(${VERSION})`);
	return sql;
}
