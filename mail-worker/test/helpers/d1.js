import { DatabaseSync } from 'node:sqlite';
import { getTableConfig } from 'drizzle-orm/sqlite-core';

// In-memory SQLite exercises the actual SQL emitted by Drizzle, without cloud bindings.
export function createD1(tables = []) {
  const sqlite = new DatabaseSync(':memory:');
  for (const table of tables) {
    const { name, columns } = getTableConfig(table);
    sqlite.exec(`CREATE TABLE "${name}" (${columns.map(column =>
      `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`
    ).join(', ')})`);
  }
  const prepare = (query, params = []) => {
    const statement = () => sqlite.prepare(query);
    return {
      bind: (...values) => prepare(query, values),
      async all() {
        const results = statement().all(...params);
        const meta = sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
        return { success: true, results, meta };
      },
      async raw() { const stmt = statement(); stmt.setReturnArrays(true); return stmt.all(...params); },
      async first(column) { const row = statement().get(...params); return (column ? row?.[column] : row) ?? null; },
      async run() {
        const info = statement().run(...params);
        return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
      },
    };
  };
  return {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    exec: query => sqlite.exec(query),
    close: () => sqlite.close(),
    sqlite,
  };
}
