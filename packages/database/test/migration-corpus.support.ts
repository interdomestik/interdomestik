import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

import { EXCLUDED_MIGRATION_FILES } from '../src/migration-corpus-manifest';

export type TempCorpus = Readonly<{
  root: string;
  meta: string;
  journal: string;
  names: readonly string[];
  file(name: string): string;
  cleanup(): Promise<void>;
}>;

// The corpus pins a 96-entry journal and four historical files (EXCLUDED_MIGRATION_FILES). WP-04
// removed those files from the live migration directory and journaled their effect in 0100, so the
// four files are kept byte-exact as fixtures. The pinned journal is the live journal's first 96
// entries, written as the corpus pinned it; its digest is checked, so a change to those entries
// fails here instead of moving the pin. The journaled SQL files come from the live directory.
const FIXTURES = fileURLToPath(new URL('./fixtures/migration-corpus/', import.meta.url));
const PINNED_ENTRIES = 96;
const PINNED_JOURNAL_SHA256 = 'b9e3b556ff02026299bf1be7d63ef641e71df7acfba283a541fe0632ce289855';

type Journal = Readonly<{ entries: ReadonlyArray<Readonly<{ tag: string }>> }>;

async function pinnedJournal(source: string): Promise<string> {
  const live = JSON.parse(await readFile(join(source, 'meta', '_journal.json'), 'utf8')) as Journal;
  const pinned = `${JSON.stringify({ ...live, entries: live.entries.slice(0, PINNED_ENTRIES) }, null, 2)}\n`;
  const digest = createHash('sha256').update(pinned).digest('hex');
  if (digest !== PINNED_JOURNAL_SHA256) {
    throw new Error(`the first ${PINNED_ENTRIES} journal entries changed (sha256 ${digest})`);
  }
  return pinned;
}

export async function makeTempCorpus(context?: TestContext): Promise<TempCorpus> {
  const source = await realpath(fileURLToPath(new URL('../drizzle/', import.meta.url)));
  const created = await mkdtemp(join(tmpdir(), 'ida-migration-corpus-'));
  const root = await realpath(created);
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rm(root, { recursive: true, force: true });
  };
  context?.after(cleanup);
  const meta = join(root, 'meta');
  const journal = join(meta, '_journal.json');
  await mkdir(meta);
  const pinned = await pinnedJournal(source);
  await writeFile(journal, pinned);
  const parsed = JSON.parse(pinned) as Journal;
  const journaled = parsed.entries.map(entry => `${entry.tag}.sql`);
  const names = Object.freeze([...journaled, ...EXCLUDED_MIGRATION_FILES]);
  await Promise.all([
    ...journaled.map(name => copyFile(join(source, name), join(root, name))),
    ...EXCLUDED_MIGRATION_FILES.map(name => copyFile(join(FIXTURES, name), join(root, name))),
  ]);
  return Object.freeze({ root, meta, journal, names, file: name => join(root, name), cleanup });
}
