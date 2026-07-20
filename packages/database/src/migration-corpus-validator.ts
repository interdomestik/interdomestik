import { createHash } from 'node:crypto';

// prettier-ignore
import { CorpusFault, type CorpusFsOps, type InternalVerificationResult, type MigrationCorpusState } from './migration-corpus-contracts';
import { withCorpusDirectories } from './migration-corpus-directories';
import { readCorpusFile } from './migration-corpus-files';
import {
  CORPUS_DOMAIN,
  CORPUS_SHA256,
  EXCLUDED_MIGRATION_FILES,
  JOURNAL_SHA256,
  MIGRATION_FILE_HASHES,
} from './migration-corpus-manifest';

type Entry = Readonly<{ breakpoints: true; idx: number; tag: string; version: '7'; when: number }>;
const JOURNAL_ERROR = 'MIGRATION_CORPUS_JOURNAL_REJECTED';
type ReadCode = typeof JOURNAL_ERROR | 'MIGRATION_CORPUS_FILE_REJECTED';

function rejectJournal(): never {
  throw new CorpusFault(JOURNAL_ERROR);
}

function keys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right));
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function journalNames(bytes: Uint8Array): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    rejectJournal();
  }
  if (!parsed || typeof parsed !== 'object' || !keys(parsed, ['dialect', 'entries', 'version'])) {
    rejectJournal();
  }
  const value = parsed as { dialect?: unknown; entries?: unknown; version?: unknown };
  if (
    value.version !== '7' ||
    value.dialect !== 'postgresql' ||
    !Array.isArray(value.entries) ||
    value.entries.length !== 93
  )
    rejectJournal();
  const seenTags = new Set<string>();
  const seenTimes = new Set<number>();
  const entries: Entry[] = [];
  for (let index = 0; index < value.entries.length; index += 1) {
    const entry = value.entries[index];
    if (
      !entry ||
      typeof entry !== 'object' ||
      !keys(entry, ['breakpoints', 'idx', 'tag', 'version', 'when'])
    )
      rejectJournal();
    const item = entry as Entry;
    if (
      item.idx !== index ||
      item.version !== '7' ||
      item.breakpoints !== true ||
      typeof item.tag !== 'string' ||
      !/^\d{4}_[A-Za-z0-9_-]+$/.test(item.tag) ||
      !Number.isSafeInteger(item.when) ||
      item.when <= 0 ||
      seenTags.has(item.tag) ||
      seenTimes.has(item.when)
    )
      rejectJournal();
    seenTags.add(item.tag);
    seenTimes.add(item.when);
    entries.push(item);
  }
  if (
    entries[0]?.tag !== '0000_watery_rawhide_kid' ||
    entries[0]?.when !== 1766044468466 ||
    entries[92]?.tag !== '0092_ida_free_start_drafts' ||
    entries[92]?.when !== 1784332800000
  )
    rejectJournal();
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    const inversion =
      index === 14 &&
      previous.tag === '0013_add_agent_clients_unique' &&
      previous.when === 1767890798000 &&
      current.tag === '0014_webhook_events_tenant_nullable' &&
      current.when === 1767469552201;
    if (index === 14 ? !inversion : current.when <= previous.when) rejectJournal();
  }
  return Object.freeze(entries.map(entry => `${entry.tag}.sql`));
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function verifyMigrationCorpusRoot(
  root: string,
  ops: Readonly<CorpusFsOps>
): Promise<InternalVerificationResult> {
  try {
    const state = await withCorpusDirectories(root, ops, async directories => {
      // prettier-ignore
      const read = (parent: string, name: string, relative: string, code: ReadCode, maximum = 65_536n) => readCorpusFile(parent, directories.realRoot, name, relative, code, maximum, ops);
      // prettier-ignore
      const journal = await read(directories.metaPath, '_journal.json', 'meta/_journal.json', JOURNAL_ERROR);
      if (digest(journal.bytes) !== JOURNAL_SHA256) rejectJournal();
      const names = journalNames(journal.bytes);
      const allNames = Object.freeze([...names, ...EXCLUDED_MIGRATION_FILES]);
      // prettier-ignore
      const expected = [`meta:directory`, ...allNames.map(name => `${name}:file`)].sort((left, right) => left.localeCompare(right));
      if (
        expected.length !== directories.rootSnapshot.length ||
        expected.some((entry, index) => entry !== directories.rootSnapshot[index])
      ) {
        throw new CorpusFault('MIGRATION_CORPUS_TOPOLOGY_REJECTED');
      }
      const aggregate = createHash('sha256').update(CORPUS_DOMAIN).update(journal.bytes);
      let aggregateSize = 0;
      for (let index = 0; index < allNames.length; index += 1) {
        const name = allNames[index];
        const remaining = BigInt(1_048_576 - aggregateSize);
        // prettier-ignore
        const file = await read(directories.realRoot, name, name, 'MIGRATION_CORPUS_FILE_REJECTED', remaining);
        aggregateSize += file.bytes.length;
        if (aggregateSize > 1_048_576 || digest(file.bytes) !== MIGRATION_FILE_HASHES[index]) {
          throw new CorpusFault('MIGRATION_CORPUS_FILE_REJECTED');
        }
        aggregate.update('\0').update(name).update('\0').update(file.bytes);
      }
      const corpusSha256 = aggregate.digest('hex');
      if (corpusSha256 !== CORPUS_SHA256) throw new CorpusFault('MIGRATION_CORPUS_FILE_REJECTED');
      return Object.freeze({
        realRoot: directories.realRoot,
        journalSha256: JOURNAL_SHA256,
        corpusSha256,
        journalNames: names,
        excludedNames: EXCLUDED_MIGRATION_FILES,
        rootIdentity: directories.rootIdentity,
      }) satisfies MigrationCorpusState;
    });
    return Object.freeze({ ok: true, state });
  } catch (error) {
    const code = error instanceof CorpusFault ? error.code : 'MIGRATION_CORPUS_ROOT_REJECTED';
    return Object.freeze({ ok: false, error: Object.freeze({ code }) });
  }
}
