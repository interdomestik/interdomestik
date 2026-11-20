import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkEntry,
  loadsDriver,
  namesClient,
  OWNER_OPERATIONS,
  PINNED_MODULES,
  root,
  RULES_MODULE,
  scriptFiles,
  WRITE,
} from './own-database-client-rules.mjs';

// CHK-13 (R-13), part (b): a script may not open a database client of its own. The unit is the
// opened client, not the statement. Every script file that names a client — a driver specifier in
// any form (also inside shell heredocs), a client command, or DATABASE_URL — is on the reviewed
// inventory with a kind whose promise own-database-client-rules.mjs checks; the negative cases of
// each kind are own-database-client-kinds.test.mjs. Part (a), the behaviour of
// assertDisposableTarget, is packages/database/test/disposable-target.test.ts.
const listPath = 'scripts/ci/own-database-client-scripts.json';
const reviewed = JSON.parse(readFileSync(join(root, listPath), 'utf8'));

test('the predicate sees every way a script names a client', () => {
  for (const source of [
    "import postgres from 'postgres';",
    'import pg from "pg";',
    "import { drizzle } from 'drizzle-orm/postgres-js';",
    "import { migrate } from 'drizzle-orm/postgres-js/migrator';",
    "import 'pg';",
    "export { default } from 'postgres';",
    "const { Client } = require('pg');",
    'const driver = await import(`postgres`);',
    "node - <<'NODE'\nconst postgres = require('postgres');\nNODE",
    'import psycopg2',
    'from asyncpg import connect',
    'const url = process.env.DATABASE_URL;',
    "const url = process.env['DATABASE_URL'];",
    'const { DATABASE_URL, OTHER } = process.env;',
    "import { env } from 'node:process'; const url = env.DATABASE_URL;",
    'const e = process.env; open(e.DATABASE_URL);',
    'psql "$DB_URL" -c "select 1"',
    'pg_dump "$URL" > out.sql',
    "execFileSync('docker', ['exec', 'db', 'createdb', name]);",
  ]) {
    assert.equal(namesClient(source), true, source);
  }
  for (const source of [
    "import { db } from '@interdomestik/database';",
    "import { x } from './postgres-helpers.mjs';",
    'const url = process.env.DATABASE_URL_RLS;',
    'const url = process.env.E2E_DATABASE_URL;',
    "const s = 'see packages/database for postgres';",
  ]) {
    assert.equal(namesClient(source), false, source);
  }
});

test('the write predicate sees the statements of the deleted scripts', () => {
  for (const statement of [
    'DROP TABLE IF EXISTS "legacy"',
    'ALTER TABLE claim ADD COLUMN x text',
    'DROP POLICY "p" ON storage.objects',
    'DELETE FROM claim',
    'ALTER ROLE r LOGIN',
    'GRANT USAGE ON SCHEMA public TO r',
    'update "legacy" set status = 1',
    'create schema x',
  ]) {
    assert.equal(WRITE.test(statement), true, statement);
  }
  assert.equal(WRITE.test('select rolsuper from pg_roles'), false);
});

test('every script that names a client is on the reviewed inventory, and nothing else', () => {
  const naming = scriptFiles()
    .filter(
      file => !PINNED_MODULES.has(file) && namesClient(readFileSync(join(root, file), 'utf8'))
    )
    .sort();
  const listed = reviewed.scripts.map(entry => entry.path).sort();
  assert.deepEqual(naming, listed, `update ${listPath} only with a reviewed reason`);
  assert.equal(new Set(listed).size, listed.length);
});

test('each listed script keeps the promise of its kind', () => {
  for (const entry of reviewed.scripts) {
    checkEntry(entry, readFileSync(join(root, entry.path), 'utf8'));
  }
  for (const operation of OWNER_OPERATIONS) {
    assert.ok(
      reviewed.scripts.some(entry => entry.path === operation.path),
      operation.path
    );
  }
});

test('the checker itself loads no driver and starts nothing but git', () => {
  const source = readFileSync(join(root, RULES_MODULE), 'utf8');
  assert.equal(loadsDriver(source), false);
  assert.deepEqual(
    [
      ...source.matchAll(
        /(?<![.\w])(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(/gu
      ),
    ].map(match => match[0]),
    ['spawnSync(']
  );
  assert.match(source, /spawnSync\(\s*'\/usr\/bin\/git',/u);
});

test('the loose destructive scripts of DATA-04 and the database-security helpers are gone', () => {
  for (const file of [
    'scripts/drop-legacy-tables.mjs',
    'scripts/apply_hardening.js',
    'scripts/harden_storage.js',
    'scripts/clean-claims.ts',
    'packages/database/drop-claims.ts',
    'packages/database/hotfix.ts',
    'scripts/database-security.sh',
    'scripts/monitor-database.sh',
  ]) {
    assert.equal(existsSync(join(root, file)), false, file);
  }
});
