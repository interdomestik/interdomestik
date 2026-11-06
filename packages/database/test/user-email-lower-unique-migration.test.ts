import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const databaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFile(path.join(databaseRoot, file), 'utf8');

test('ACQ-2b1 migration refuses existing case-folded duplicates before the global index', async () => {
  const sql = await read('drizzle/0098_user_email_lower_unique.sql');
  const check = sql.indexOf('GROUP BY lower(btrim("email")) HAVING count(*) > 1');
  const index = sql.indexOf(
    'CREATE UNIQUE INDEX "user_email_lower_unique" ON "user" USING btree (lower("email"));'
  );
  assert.ok(check > 0, 'duplicate pre-check');
  assert.ok(index > check, 'the index is created only after the pre-check');
  assert.match(sql, /RAISE EXCEPTION 'user: case-folded duplicate emails exist/u);
  // Global: no tenant column, partial predicate or concurrent build inside the migration.
  assert.doesNotMatch(sql, /tenant_id|WHERE\s+"|CONCURRENTLY/u);
  // Accounts are never merged or rewritten by the migration.
  assert.doesNotMatch(sql, /\b(UPDATE|DELETE)\b/u);
});

test('ACQ-2b1 migration is journaled after the consent migration', async () => {
  const journal = JSON.parse(await read('drizzle/meta/_journal.json')) as {
    entries: { idx: number; tag: string }[];
  };
  const tags = journal.entries.map(entry => entry.tag);
  assert.equal(tags.at(-1), '0098_user_email_lower_unique');
  assert.equal(tags.at(-2), '0097_member_leads_consent');
});
