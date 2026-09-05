import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { localD1 } from './helpers/local-d1';
import { migrateBeforeDeploy } from '../scripts/migrate-mail-operations.mjs';

const databases = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function queryFor(db) {
  databases.push(db);
  return async sql => {
    const statement = db.prepare(sql);
    if (statement.columns().length) return statement.all();
    statement.run();
    return [];
  };
}

it('upgrades an existing database before activation and is repeatable', async () => {
  const { sqlite } = localD1();
  sqlite.exec('UPDATE user SET send_count=7 WHERE user_id=1');
  const query = queryFor(sqlite);
  expect(await migrateBeforeDeploy(query)).toBe('migrated');
  expect(sqlite.prepare('SELECT send_count FROM user WHERE user_id=1').get().send_count).toBe(7);
  expect(sqlite.prepare('SELECT version FROM mail_schema_version').get().version).toBe(1);
  expect(await migrateBeforeDeploy(query)).toBe('current');
});

it('leaves a new empty database for the existing initial installer', async () => {
  const db = new DatabaseSync(':memory:');
  expect(await migrateBeforeDeploy(queryFor(db))).toBe('new-database');
  expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
});

it('blocks activation for a partial legacy schema', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE user(user_id INTEGER)');
  await expect(migrateBeforeDeploy(queryFor(db))).rejects.toThrow(/incomplete/i);
});

it('does not record success after failure and safely resumes completed ALTERs', async () => {
  const { sqlite } = localD1();
  const query = queryFor(sqlite);
  await expect(migrateBeforeDeploy(sql => {
    if (sql.startsWith('CREATE UNIQUE INDEX')) throw new Error('D1 unavailable');
    return query(sql);
  })).rejects.toThrow('D1 unavailable');
  expect(sqlite.prepare('SELECT * FROM mail_schema_version').all()).toEqual([]);
  expect(await migrateBeforeDeploy(query)).toBe('migrated');
  expect(sqlite.prepare('SELECT version FROM mail_schema_version').get().version).toBe(1);
});
