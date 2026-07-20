import { copyFile, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
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

export async function makeTempCorpus(context?: TestContext): Promise<TempCorpus> {
  const source = await realpath(fileURLToPath(new URL('../drizzle/', import.meta.url)));
  const created = await mkdtemp(join(tmpdir(), 'ida-migration-corpus-'));
  const root = await realpath(created);
  const meta = join(root, 'meta');
  const journal = join(meta, '_journal.json');
  await mkdir(meta);
  await copyFile(join(source, 'meta', '_journal.json'), journal);
  const parsed = JSON.parse(await readFile(journal, 'utf8')) as {
    entries: ReadonlyArray<Readonly<{ tag: string }>>;
  };
  const names = Object.freeze([
    ...parsed.entries.map(entry => `${entry.tag}.sql`),
    ...EXCLUDED_MIGRATION_FILES,
  ]);
  await Promise.all(names.map(name => copyFile(join(source, name), join(root, name))));
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rm(root, { recursive: true, force: true });
  };
  context?.after(cleanup);
  return Object.freeze({ root, meta, journal, names, file: name => join(root, name), cleanup });
}
