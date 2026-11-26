import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveReleasePath } from './release-migration-path.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const TAG = /^(\d{4})_[a-z0-9_-]+$/u;

export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

export type JournalEntry = { tag: string; idx: number; when: number; hash: string };

function parseContractRegistry(registry: string) {
  const config = JSON.parse(registry);
  if (
    config?.version !== 1 ||
    Object.keys(config).length !== 3 ||
    !config.pairs ||
    Object.getPrototypeOf(config.pairs) !== Object.prototype ||
    Object.keys(config.pairs).length === 0 ||
    !config.sqlSha256 ||
    Object.getPrototypeOf(config.sqlSha256) !== Object.prototype
  )
    throw new Error('REGISTRY_INVALID');

  const pairs: Record<string, unknown> = config.pairs;
  const sqlSha256: Record<string, unknown> = config.sqlSha256;
  return { pairs, sqlSha256 };
}

function registerPairs(folder: string, entries: JournalEntry[], pairs: Record<string, unknown>) {
  const occupied = new Set<number>();
  const registered = new Set<string>();
  const contracts: number[] = [];
  for (const [contract, expand] of Object.entries(pairs)) {
    const contractMatch = TAG.exec(contract);
    const expandMatch = typeof expand === 'string' ? TAG.exec(expand) : null;
    if (!contractMatch || !expandMatch) throw new Error('REGISTRY_TAG_INVALID');
    const end = Number(contractMatch[1]);
    const start = Number(expandMatch[1]);
    if (end !== start + 1 || occupied.has(start) || occupied.has(end))
      throw new Error('REGISTRY_POSITIONS_INVALID');
    occupied.add(start);
    occupied.add(end);
    registered.add(contract);
    registered.add(expandMatch[0]);

    // Occupied positions must have the exact reviewed tags. Before those positions,
    // a dormant pair has neither registered SQL files on disk nor phase SQL in the journal.
    if (entries.length <= start) {
      if (
        [contract, expandMatch[0]].some(tag =>
          lstatSync(path.join(folder, `${tag}.sql`), { throwIfNoEntry: false })
        )
      )
        throw new Error('DORMANT_PAIR_HAS_SQL');
      continue;
    }
    if (entries[start]?.tag !== expand || entries[end]?.tag !== contract)
      throw new Error('REGISTERED_PAIR_MISMATCH');
    contracts.push(end);
  }
  return { contracts, registered };
}

function validateRegisteredSql(
  entries: JournalEntry[],
  registered: Set<string>,
  sqlSha256: Record<string, unknown>
) {
  const hashes = new Set<string>();
  if (Object.keys(sqlSha256).length !== registered.size) throw new Error('REGISTRY_INVALID');
  for (const tag of registered) {
    const hash = sqlSha256[tag];
    if (typeof hash !== 'string' || !HASH.test(hash) || hashes.has(hash))
      throw new Error('REGISTRY_INVALID');
    hashes.add(hash);
  }
  for (const { tag, hash } of entries) {
    if (registered.has(tag)) {
      if (sqlSha256[tag] !== hash) throw new Error('REGISTERED_PHASE_SQL_MISMATCH');
    } else if (hashes.has(hash) || /_(?:expand|contract)$/u.test(tag)) {
      throw new Error('UNREGISTERED_PHASE');
    }
  }
}

function registeredContracts(folder: string, entries: JournalEntry[], registry: string) {
  const { pairs, sqlSha256 } = parseContractRegistry(registry);
  const { contracts, registered } = registerPairs(folder, entries, pairs);
  validateRegisteredSql(entries, registered, sqlSha256);
  return contracts.sort((a, b) => a - b);
}

export function readReleaseJournal(
  folder: string,
  policyPath: string,
  { candidateRoot, policyRoot }: { candidateRoot: string; policyRoot: string }
) {
  const directory = resolveReleasePath(candidateRoot, folder);
  const journal = readFileSync(
    resolveReleasePath(candidateRoot, path.join(directory, 'meta/_journal.json')),
    'utf8'
  );
  const registry = readFileSync(resolveReleasePath(policyRoot, policyPath), 'utf8');
  const parsed = JSON.parse(journal);
  if (!Array.isArray(parsed?.entries) || parsed.entries.length === 0)
    throw new Error('JOURNAL_INVALID');
  const entries: JournalEntry[] = parsed.entries.map(
    (entry: { tag?: unknown; idx?: unknown; when?: unknown }, idx: number) => {
      const { tag, when } = entry;
      const match = typeof tag === 'string' ? TAG.exec(tag) : null;
      if (
        !match ||
        typeof tag !== 'string' ||
        Number(match[1]) !== idx ||
        entry.idx !== idx ||
        typeof when !== 'number' ||
        !Number.isSafeInteger(when) ||
        when <= 0
      )
        throw new Error('JOURNAL_ENTRY_INVALID');
      return { tag, idx, when, hash: '' };
    }
  );
  const migrations = entries.map(entry => {
    const bytes = readFileSync(
      resolveReleasePath(candidateRoot, path.join(directory, `${entry.tag}.sql`))
    );
    const sql = bytes.toString('utf8');
    if (!Buffer.from(sql).equals(bytes) || !sql.trim()) throw new Error('JOURNAL_SQL_INVALID');
    entry.hash = sha256(bytes);
    return {
      hash: entry.hash,
      folderMillis: entry.when,
      sql: sql.split('--> statement-breakpoint'),
    };
  });
  return {
    contracts: registeredContracts(directory, entries, registry),
    entries,
    migrations,
    journalSha256: sha256(journal),
    registrySha256: sha256(registry),
    ledgerSha256: sha256(JSON.stringify(entries)),
  };
}
