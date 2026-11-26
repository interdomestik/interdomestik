import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// The migration ledger a database migrated by this release must hold: drizzle's migrator
// (packages/database/src/migrate.ts, folder ./drizzle) records, for each journal entry in order, the
// sha256 of the whole SQL file and the entry's `when` as created_at.

export const MIGRATIONS_DIR = 'packages/database/drizzle';

/** The ordered expected ledger and the journal digest, read from the release checkout at `root`. */
export function readExpectedLedger(root) {
  const journalPath = path.join(root, MIGRATIONS_DIR, 'meta', '_journal.json');
  const journalBytes = fs.readFileSync(journalPath);
  const journal = JSON.parse(journalBytes.toString('utf8'));
  if (!Array.isArray(journal.entries) || journal.entries.length === 0)
    throw new Error('migration journal has no entries');
  const entries = journal.entries.map((entry, index) => {
    if (entry.idx !== index || typeof entry.tag !== 'string' || !Number.isSafeInteger(entry.when))
      throw new Error(`migration journal entry ${index} is malformed`);
    const sql = fs.readFileSync(path.join(root, MIGRATIONS_DIR, `${entry.tag}.sql`));
    return {
      tag: entry.tag,
      when: entry.when,
      hash: createHash('sha256').update(sql.toString('utf8')).digest('hex'),
    };
  });
  return {
    journalSha256: createHash('sha256').update(journalBytes).digest('hex'),
    entries,
  };
}

/** Match the protected expand plan to this exact checkout before accepting a shorter ledger. */
export function expectedExpandPrefix(journal, raw, { expectedSha, runId }) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16_384)
    throw new Error('invalid expand manifest');
  const manifest = JSON.parse(raw);
  const plan = manifest?.plan;
  if (
    manifest?.version !== 1 ||
    manifest.environment !== 'staging' ||
    manifest.commitSha !== expectedSha ||
    manifest.runId !== runId ||
    plan?.journalSha256 !== journal.journalSha256 ||
    plan.finalCount !== journal.entries.length ||
    !Number.isSafeInteger(plan.expandCount) ||
    plan.expandCount < 1 ||
    plan.expandCount > plan.finalCount
  )
    throw new Error('expand manifest mismatch');
  const entries = journal.entries.slice(0, plan.expandCount);
  const prefix = entries.map(({ tag, when, hash }, idx) => ({ tag, idx, when, hash }));
  if (createHash('sha256').update(JSON.stringify(prefix)).digest('hex') !== plan.expandLedgerSha256)
    throw new Error('expand ledger mismatch');
  return entries;
}
