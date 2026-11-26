import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { MigrationExecutionSql } from './migration-execution-contracts';
import { assertTransactionalMigration } from './release-migration-sql';

const TAG = /^(\d{4})_[a-z0-9_-]+$/u;

export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

type JournalEntry = { tag: string; idx: number; when: number; hash: string };
type Plan = {
  backendMarkerSha256: string;
  journalSha256: string;
  ledgerSha256: string;
  registrySha256: string;
  beforeCount: number;
  expandCount: number;
  expandLedgerSha256: string;
  finalCount: number;
  expand: JournalEntry | null;
  contract: JournalEntry | null;
};

type Request =
  { mode: 'expand' } | { mode: 'contract'; plan: Plan; authorize: () => Promise<number> };

function registeredContracts(folder: string, entries: JournalEntry[], registry: string) {
  const config = JSON.parse(registry);
  if (
    config?.version !== 1 ||
    Object.keys(config).length !== 2 ||
    !config.pairs ||
    Object.getPrototypeOf(config.pairs) !== Object.prototype ||
    Object.keys(config.pairs).length === 0
  )
    throw new Error('REGISTRY_INVALID');

  const occupied = new Set<number>();
  const registered = new Set<string>();
  const contracts: number[] = [];
  for (const [contract, expand] of Object.entries(config.pairs)) {
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

    // Dormancy is allowed only before the reserved journal positions. Moving or renaming
    // both tags cannot turn an occupied boundary into a dormant one.
    if (entries.length <= start) {
      if ([contract, expandMatch[0]].some(tag => existsSync(path.join(folder, `${tag}.sql`))))
        throw new Error('DORMANT_PAIR_HAS_SQL');
      continue;
    }
    if (entries[start]?.tag !== expand || entries[end]?.tag !== contract)
      throw new Error('REGISTERED_PAIR_MISMATCH');
    contracts.push(end);
  }
  if (entries.some(({ tag }) => /_(?:expand|contract)$/u.test(tag) && !registered.has(tag)))
    throw new Error('UNREGISTERED_PHASE');
  return contracts.sort((a, b) => a - b);
}

export function readReleaseJournal(folder: string) {
  const journal = readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8');
  const registry = readFileSync(path.join(folder, 'contract-phases.json'), 'utf8');
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
  const contracts = registeredContracts(folder, entries, registry);
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  if (
    migrations.length !== entries.length ||
    migrations.some((migration, idx) => migration.folderMillis !== entries[idx].when)
  )
    throw new Error('JOURNAL_ENTRY_INVALID');
  entries.forEach((entry, idx) => {
    entry.hash = migrations[idx].hash;
  });
  return {
    contracts,
    entries,
    migrations,
    journalSha256: sha256(journal),
    registrySha256: sha256(registry),
    ledgerSha256: sha256(JSON.stringify(entries)),
  };
}

function planFrom(
  journal: ReturnType<typeof readReleaseJournal>,
  backendMarkerSha256: string,
  beforeCount: number
): Plan {
  if (!Number.isSafeInteger(beforeCount) || beforeCount < 0 || beforeCount > journal.entries.length)
    throw new Error('MANIFEST_PLAN_MISMATCH');
  const pending = journal.contracts.filter(idx => idx >= beforeCount);
  if (pending.length > 1) throw new Error('INTERMEDIATE_RELEASE_REQUIRED');
  const expandCount = pending[0] ?? journal.entries.length;
  return {
    backendMarkerSha256,
    journalSha256: journal.journalSha256,
    ledgerSha256: journal.ledgerSha256,
    registrySha256: journal.registrySha256,
    beforeCount,
    expandCount,
    expandLedgerSha256: sha256(JSON.stringify(journal.entries.slice(0, expandCount))),
    finalCount: journal.entries.length,
    expand: pending.length ? journal.entries[expandCount - 1] : null,
    contract: pending.length ? journal.entries[expandCount] : null,
  };
}

async function readLedger(tx: MigrationExecutionSql, entries: JournalEntry[]) {
  const [relation] =
    await tx`SELECT pg_catalog.to_regclass('drizzle.__drizzle_migrations') AS name`;
  if (!relation.name) return { exists: false, count: 0 };
  const rows = await tx<{ hash: string; created_at: string }[]>`
    SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id
    LIMIT ${entries.length + 1}
  `;
  if (
    rows.some(
      (row, idx) => row.hash !== entries[idx]?.hash || row.created_at !== String(entries[idx]?.when)
    )
  )
    throw new Error('LEDGER_DIVERGENT');
  return { exists: true, count: rows.length };
}

async function apply(
  tx: MigrationExecutionSql,
  journal: ReturnType<typeof readReleaseJournal>,
  from: number,
  through: number
) {
  for (const migration of journal.migrations.slice(from, through)) {
    for (const statement of migration.sql) {
      assertTransactionalMigration(statement);
      await tx.unsafe(statement);
      if (/^\s*RESET\s+statement_timeout\s*;\s*$/iu.test(statement))
        await tx`SET LOCAL statement_timeout = '45s'`;
    }
    await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
             VALUES (${migration.hash}, ${migration.folderMillis})`;
  }
  if ((await readLedger(tx, journal.entries)).count !== through)
    throw new Error('LEDGER_WRITE_MISMATCH');
}

async function executePhase(
  tx: MigrationExecutionSql,
  journal: ReturnType<typeof readReleaseJournal>,
  backendMarkerSha256: string,
  request: Request
) {
  await tx`SET LOCAL lock_timeout = '5s'`;
  await tx`SET LOCAL statement_timeout = '45s'`;
  await tx`SET LOCAL idle_in_transaction_session_timeout = '45s'`;
  await tx`SELECT pg_catalog.pg_advisory_xact_lock(673167055, -773281837)`;
  await tx`SET LOCAL standard_conforming_strings = on`;
  const markers = await tx<{ marker: string }[]>`
      SELECT marker FROM runtime_attestation.backend_marker LIMIT 2
    `;
  if (markers.length !== 1 || sha256(markers[0].marker) !== backendMarkerSha256)
    throw new Error('BACKEND_MISMATCH');

  const ledger = await readLedger(tx, journal.entries);
  if (request.mode === 'expand') {
    const plan = planFrom(journal, backendMarkerSha256, ledger.count);
    if (!ledger.exists) {
      await tx`CREATE SCHEMA IF NOT EXISTS drizzle`;
      await tx`CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY, hash text NOT NULL, created_at bigint
        )`;
    }
    await apply(tx, journal, ledger.count, plan.expandCount);
    return { plan, status: 'expanded' as const };
  }

  if (request.mode !== 'contract') throw new Error('MODE_INVALID');
  const plan = planFrom(journal, backendMarkerSha256, request.plan.beforeCount);
  if (!plan.contract || JSON.stringify(plan) !== JSON.stringify(request.plan))
    throw new Error('MANIFEST_PLAN_MISMATCH');
  if (ledger.count === plan.finalCount) return { plan, status: 'already-committed' as const };
  if (ledger.count !== plan.expandCount) throw new Error('EXPAND_PREFIX_MISMATCH');
  const expiresAt = await request.authorize();
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) throw new Error('RECEIPT_EXPIRED');
  await apply(tx, journal, plan.expandCount, plan.finalCount);
  if (Date.now() >= expiresAt) throw new Error('RECEIPT_EXPIRED');
  return { plan, status: 'contracted' as const };
}

export async function runReleaseMigrations(
  reserved: MigrationExecutionSql,
  journal: ReturnType<typeof readReleaseJournal>,
  backendMarkerSha256: string,
  request: Request
) {
  // Both the protected preflight and the scratch fixture supply a single reserved session.
  await reserved`BEGIN ISOLATION LEVEL READ COMMITTED`;
  let committing = false;
  try {
    const result = await executePhase(reserved, journal, backendMarkerSha256, request);
    committing = true;
    await reserved`COMMIT`;
    return result;
  } catch (error) {
    try {
      await reserved`ROLLBACK`;
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'RELEASE_TRANSACTION_OUTCOME_UNKNOWN');
    }
    if (committing) throw new Error('RELEASE_TRANSACTION_OUTCOME_UNKNOWN', { cause: error });
    throw error;
  }
}
