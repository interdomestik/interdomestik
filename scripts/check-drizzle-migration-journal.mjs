#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function resolveRepoRoot() {
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (git.status === 0 && git.stdout.trim()) {
    return git.stdout.trim();
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();
const DRIZZLE_DIR = path.resolve(REPO_ROOT, 'packages/database/drizzle');
const JOURNAL_PATH = path.join(DRIZZLE_DIR, 'meta', '_journal.json');
const MIGRATION_FILE_PATTERN = /^\d{4}_.+\.sql$/;

// Baseline exceptions currently present on main. Keep this list short and temporary.
const LEGACY_ORPHAN_ALLOWLIST = new Set([
  '0015_drop_tenant_defaults.sql',
  '0016_harden_better_auth.sql',
  '0017_performance_indexes.sql',
  '0018_add_commission_idempotency_index.sql',
]);

function fail(message) {
  console.error(`\n[db:migrations:check-journal] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(DRIZZLE_DIR)) {
  fail(`Drizzle directory not found: ${DRIZZLE_DIR}`);
}

if (!fs.existsSync(JOURNAL_PATH)) {
  fail(`Drizzle journal not found: ${JOURNAL_PATH}`);
}

let journalRaw = '';
let journal = null;

try {
  journalRaw = fs.readFileSync(JOURNAL_PATH, 'utf8');
} catch (error) {
  fail(`Unable to read Drizzle journal at ${JOURNAL_PATH}: ${String(error.message || error)}`);
}

try {
  journal = JSON.parse(journalRaw);
} catch (error) {
  fail(`Invalid JSON in ${JOURNAL_PATH}: ${String(error.message || error)}`);
}

if (!Array.isArray(journal?.entries)) {
  fail(`Invalid journal shape in ${JOURNAL_PATH}: expected "entries" array`);
}

const invalidEntries = journal.entries
  .map((entry, index) => ({ entry, index }))
  .filter(item => {
    const tag = typeof item.entry?.tag === 'string' ? item.entry.tag.trim() : '';
    return tag.length === 0;
  });

if (invalidEntries.length > 0) {
  fail(
    [
      `Invalid journal entries in ${JOURNAL_PATH}: expected non-empty "tag"`,
      ...invalidEntries.map(item => `  - entries[${item.index}]`),
    ].join('\n')
  );
}

const journalSql = new Set(journal.entries.map(entry => `${entry.tag.trim()}.sql`));

const sqlFiles = fs
  .readdirSync(DRIZZLE_DIR)
  .filter(name => MIGRATION_FILE_PATTERN.test(name))
  .sort();

const missingFromDisk = [...journalSql].filter(file => !sqlFiles.includes(file)).sort();
const orphanedAll = sqlFiles.filter(file => !journalSql.has(file)).sort();
const orphanedUnexpected = orphanedAll.filter(file => !LEGACY_ORPHAN_ALLOWLIST.has(file));
const allowlistStale = [...LEGACY_ORPHAN_ALLOWLIST]
  .filter(file => !orphanedAll.includes(file))
  .sort();

if (missingFromDisk.length > 0) {
  fail(
    [
      'Journal references SQL files that do not exist:',
      ...missingFromDisk.map(file => `  - ${file}`),
      '',
      'Regenerate migrations or repair packages/database/drizzle/meta/_journal.json.',
      'Recommended: pnpm --filter @interdomestik/database generate --name <migration_name>',
    ].join('\n')
  );
}

if (orphanedUnexpected.length > 0) {
  fail(
    [
      'Found unjournaled SQL migrations (not allowed):',
      ...orphanedUnexpected.map(file => `  - ${file}`),
      '',
      'Use drizzle-kit generate so new migrations are tracked in _journal.json.',
      'Recommended: pnpm --filter @interdomestik/database generate --name <migration_name>',
      'Never drop raw migration SQL into packages/database/drizzle without journal entries.',
      'If this is a sanctioned legacy exception, add it to LEGACY_ORPHAN_ALLOWLIST in scripts/check-drizzle-migration-journal.mjs.',
    ].join('\n')
  );
}

if (allowlistStale.length > 0) {
  console.warn(
    [
      '[db:migrations:check-journal] Stale allowlist entries detected (can be removed):',
      ...allowlistStale.map(file => `  - ${file}`),
    ].join('\n')
  );
}

console.log(
  `[db:migrations:check-journal] OK (journaled=${journalSql.size}, sql=${sqlFiles.length}, legacy-allowlist=${LEGACY_ORPHAN_ALLOWLIST.size})`
);
