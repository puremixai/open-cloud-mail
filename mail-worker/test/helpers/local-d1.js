import { DatabaseSync } from 'node:sqlite';

// Execute real SQLite statements; a batch is one transaction, as in D1.
export function localD1() {
	const sqlite = new DatabaseSync(':memory:');
	const db = {
		prepare(sql) {
			let params = [];
			const execute = (raw = false) => {
				const stmt = sqlite.prepare(sql);
				if (raw) stmt.setReturnArrays(true);
				if (stmt.columns().length) {
					const results = stmt.all(...params);
					return { results, success: true, meta: { changes: Number(sqlite.prepare('SELECT changes() AS n').get().n) } };
				}
				const result = stmt.run(...params);
				return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
			};
			return {
				bind(...values) { params = values; return this; },
				async all() { return execute(); },
				async run() { return execute(); },
				async raw() { return execute(true).results; },
				async first(column) { const row = execute().results[0] ?? null; return column && row ? row[column] : row; },
				execute,
			};
		},
		async batch(statements) {
			sqlite.exec('BEGIN');
			try {
				const results = statements.map(s => s.execute());
				sqlite.exec('COMMIT');
				return results;
			} catch (error) { sqlite.exec('ROLLBACK'); throw error; }
		},
		sqlite,
	};
	sqlite.exec(`
		CREATE TABLE user (user_id INTEGER PRIMARY KEY, email TEXT, type INTEGER DEFAULT 1, send_count INTEGER DEFAULT 0, is_del INTEGER DEFAULT 0);
		CREATE TABLE account (account_id INTEGER PRIMARY KEY, user_id INTEGER, email TEXT, is_del INTEGER DEFAULT 0);
		CREATE TABLE email (email_id INTEGER PRIMARY KEY AUTOINCREMENT, send_email TEXT, name TEXT, account_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL, subject TEXT, code TEXT DEFAULT '', text TEXT, content TEXT, cc TEXT DEFAULT '[]', bcc TEXT DEFAULT '[]',
		recipient TEXT, to_email TEXT DEFAULT '', to_name TEXT DEFAULT '', in_reply_to TEXT DEFAULT '', relation TEXT DEFAULT '',
		message_id TEXT DEFAULT '', type INTEGER DEFAULT 0, status INTEGER DEFAULT 0, resend_email_id TEXT, message TEXT,
		unread INTEGER DEFAULT 0, create_time TEXT DEFAULT CURRENT_TIMESTAMP, is_del INTEGER DEFAULT 0);
		CREATE TABLE attachments (att_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, email_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL, key TEXT NOT NULL, filename TEXT, mime_type TEXT, size INTEGER, status INTEGER DEFAULT 0,
		type INTEGER DEFAULT 0, disposition TEXT, related TEXT, content_id TEXT, encoding TEXT, create_time TEXT DEFAULT CURRENT_TIMESTAMP);
		CREATE TABLE star (star_id INTEGER PRIMARY KEY, user_id INTEGER, email_id INTEGER);
		INSERT INTO user(user_id,email) VALUES (1,'sender@local.test'),(2,'other@local.test');
		INSERT INTO account VALUES (1,1,'sender@local.test',0);
	`);
	return db;
}
