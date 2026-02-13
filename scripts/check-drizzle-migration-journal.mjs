#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DRIZZLE_DIR = path.resolve(process.cwd(), 'packages/database/drizzle');
const JOURNAL_PATH = path.join(DRIZZLE_DIR, 'meta', '_journal.json');

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

const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf8'));
const entries = Array.isArray(journal?.entries) ? journal.entries : [];
const journalSql = new Set(
  entries
    .map(entry => String(entry?.tag || '').trim())
    .filter(Boolean)
    .map(tag => `${tag}.sql`)
);

const sqlFiles = fs.readdirSync(DRIZZLE_DIR).filter(name => name.endsWith('.sql')).sort();

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
