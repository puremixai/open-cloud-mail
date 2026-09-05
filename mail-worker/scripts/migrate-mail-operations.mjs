import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { VERSION, mailOperationMigration } from '../src/migrations/mail-operations.mjs';

// Additive migration, run while the old Worker is still serving. The CLI may
// commit each statement separately: introspection makes interruption retryable,
// and the version marker is written only after every preceding step succeeds.
export async function migrateBeforeDeploy(query) {
  const tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user','email','attachments')");
  if (!tables.length) return 'new-database';
  if (tables.length !== 3) throw new Error('Existing mail schema is incomplete; initialize it before upgrading');
  await query('CREATE TABLE IF NOT EXISTS mail_schema_version (version INTEGER PRIMARY KEY)');
  if ((await query(`SELECT version FROM mail_schema_version WHERE version=${VERSION}`)).length) return 'current';
  const attachments = await query("PRAGMA table_info('attachments')");
  const users = await query("PRAGMA table_info('user')");
  for (const sql of mailOperationMigration(attachments, users)) await query(sql);
  return 'migrated';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const remote = args.includes('--remote'), local = args.includes('--local');
  if (remote === local) throw new Error('Choose exactly one of --remote or --local');
  const configIndex = args.indexOf('--config');
  const config = configIndex < 0 ? 'wrangler-action.toml' : args[configIndex + 1];
  if (!config || config.startsWith('--')) throw new Error('Missing --config path');
  const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const query = async sql => {
    const output = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'db', '--config', config,
      remote ? '--remote' : '--local', '--json', '--command', sql], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const responses = JSON.parse(output);
    if (!Array.isArray(responses) || responses.some(item => item.success === false)) throw new Error('D1 migration query failed');
    return responses.flatMap(item => item.results || []);
  };
  console.log(`Mail schema preflight: ${await migrateBeforeDeploy(query)}`);
}
