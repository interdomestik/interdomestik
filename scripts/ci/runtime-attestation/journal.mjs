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
