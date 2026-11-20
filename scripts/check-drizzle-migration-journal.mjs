#!/usr/bin/env node
// CHK-12 (R-12): a schema change travels one road, the Drizzle journal. Every SQL file under
// packages/database/drizzle, at any depth and by any name, is a journaled `<tag>.sql` at its top
// level; every journal entry has its file; and every timestamp exceeds all the timestamps before it.
// There is no allow-list of loose files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const compareText = (left, right) => left.localeCompare(right);

// The one inversion on main when the order rule was adopted (WP-04): entry 13's timestamp was set by
// hand later than entry 14's. The journal is generated output and is never edited (R-36), so the
// exact pair is pinned here; any other inversion, or a change to this pair, fails. The migrator
// compares a database's latest applied timestamp with each entry, so every later entry must exceed
// the maximum before it, entry 13's included.
export const BASELINE_TIMESTAMP_INVERSION = Object.freeze({
  position: 14,
  tag: '0014_webhook_events_tenant_nullable',
  when: 1767469552201,
  previousTag: '0013_add_agent_clients_unique',
  previousWhen: 1767890798000,
});

const RECOMMENDED =
  'Recommended: pnpm db:generate --name <migration_name> (or --custom for SQL-only)';

// The migrator reads `<tag>.sql` with the tag as written, so a tag is one plain file-name
// component, compared untrimmed.
const TAG = /^[A-Za-z0-9_-]+$/u;

function entryFailures(entries) {
  const failures = [];
  entries.forEach((entry, position) => {
    const tag = typeof entry?.tag === 'string' ? entry.tag : '';
    if (!tag) failures.push(`entries[${position}] has no tag`);
    else if (!TAG.test(tag)) {
      failures.push(`entries[${position}] tag ${JSON.stringify(tag)} is not one plain file name`);
    }
    if (entry?.idx !== position) failures.push(`entries[${position}] has idx ${entry?.idx}`);
    if (!Number.isSafeInteger(entry?.when) || entry.when <= 0) {
      failures.push(`entries[${position}] has no valid timestamp`);
    }
    if (tag && !tag.startsWith(`${String(position).padStart(4, '0')}_`)) {
      failures.push(`entries[${position}] tag ${tag} does not carry its index`);
    }
  });
  return failures;
}

function isBaselineInversion(entries, position) {
  const pin = BASELINE_TIMESTAMP_INVERSION;
  const [previous, entry] = [entries[position - 1], entries[position]];
  return (
    position === pin.position &&
    entry?.tag === pin.tag &&
    entry.when === pin.when &&
    previous?.tag === pin.previousTag &&
    previous.when === pin.previousWhen
  );
}

function orderFailures(entries) {
  const failures = [];
  let latest = entries[0].when;
  for (let position = 1; position < entries.length; position += 1) {
    const { tag, when } = entries[position];
    if (when <= latest && !isBaselineInversion(entries, position)) {
      failures.push(`entries[${position}] (${tag}) is not later than every entry before it`);
    }
    latest = Math.max(latest, when);
  }
  const pin = BASELINE_TIMESTAMP_INVERSION;
  if (!isBaselineInversion(entries, pin.position)) {
    failures.push(`the pinned baseline inversion ${pin.previousTag} > ${pin.tag} changed`);
  }
  return failures;
}

function fileFailures(tags, sqlPaths) {
  const failures = [];
  const journaled = new Set(tags.map(tag => `${tag}.sql`));
  const present = new Set(sqlPaths);
  for (const file of [...journaled].filter(file => !present.has(file)).sort(compareText)) {
    failures.push(`the journal names ${file}, which does not exist`);
  }
  for (const file of [...present].filter(file => !journaled.has(file)).sort(compareText)) {
    failures.push(`${file} is not in the journal; the migrator never applies it`);
  }
  return failures;
}

/**
 * Returns the failures for one journal and every `.sql` path under the migration directory,
 * relative to it with `/` separators; empty means valid.
 */
export function journalFailures(journalRaw, sqlPaths) {
  let journal;
  try {
    journal = JSON.parse(journalRaw);
  } catch {
    return ['the journal is not valid JSON'];
  }
  if (!Array.isArray(journal?.entries)) return ['the journal has no "entries" array'];
  if (journal.entries.length === 0) return ['the journal has no entries'];
  const failures = entryFailures(journal.entries);
  if (failures.length > 0) return failures;
  const tags = journal.entries.map(entry => entry.tag);
  return [...orderFailures(journal.entries), ...fileFailures(tags, sqlPaths)];
}

/** Every `.sql` file under `dir`, at any depth, relative to it with `/` separators. */
export function sqlPathsUnder(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map(entry =>
      path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')
    );
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const drizzleDir = path.join(repoRoot, 'packages/database/drizzle');
  const journalPath = path.join(drizzleDir, 'meta', '_journal.json');
  let journalRaw;
  let files;
  try {
    journalRaw = fs.readFileSync(journalPath, 'utf8');
    files = sqlPathsUnder(drizzleDir);
  } catch (error) {
    console.error(`[db:migrations:check-journal] cannot read the journal: ${error.code ?? error}`);
    process.exit(1);
  }
  const failures = journalFailures(journalRaw, files);
  if (failures.length > 0) {
    console.error(
      [
        '[db:migrations:check-journal] failed:',
        ...failures.map(line => `  - ${line}`),
        RECOMMENDED,
      ].join('\n')
    );
    process.exit(1);
  }
  const entries = JSON.parse(journalRaw).entries.length;
  console.log(`[db:migrations:check-journal] OK (journaled=${entries}, loose=0, order=strict)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
