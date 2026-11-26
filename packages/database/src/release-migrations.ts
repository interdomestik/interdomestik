import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { bootstrapMigrationLedger, validatePublicSchema } from './migration-execution-bootstrap';
import { inspectMigrationLedgerCatalog } from './migration-ledger-catalog';
import { consumeReleaseAttempt, verifyBackend } from './release-migration-catalog';
import { verifyReleaseShape } from './release-migration-shape';
import type { MigrationExecutionSql } from './migration-execution-contracts';
import { assertTransactionalMigration } from './release-migration-sql';

const HASH = /^[a-f0-9]{64}$/u;
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
  | { mode: 'expand' }
  | { mode: 'recover'; plan: Plan }
  | {
      mode: 'contract';
      plan: Plan;
      approval: { nonce: string; expiresAt: number; verifyLive: () => Promise<void> };
    };

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
      if ([contract, expandMatch[0]].some(tag => existsSync(path.join(folder, `${tag}.sql`))))
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

export function readReleaseJournal(folder: string, policyPath: string) {
  const journal = readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8');
  const registry = readFileSync(policyPath, 'utf8');
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
    const bytes = readFileSync(path.join(folder, `${entry.tag}.sql`));
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
    contracts: registeredContracts(folder, entries, registry),
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
  const pending = journal.contracts.find(idx => idx >= beforeCount);
  const expandCount = pending ?? journal.entries.length;
  return {
    backendMarkerSha256,
    journalSha256: journal.journalSha256,
    ledgerSha256: journal.ledgerSha256,
    registrySha256: journal.registrySha256,
    beforeCount,
    expandCount,
    expandLedgerSha256: sha256(JSON.stringify(journal.entries.slice(0, expandCount))),
    finalCount: pending === undefined ? expandCount : expandCount + 1,
    expand: pending === undefined ? null : journal.entries[expandCount - 1],
    contract: pending === undefined ? null : journal.entries[expandCount],
  };
}

async function readLedger(tx: MigrationExecutionSql, entries: JournalEntry[], readOnly: boolean) {
  const catalog = await inspectMigrationLedgerCatalog(tx);
  if (catalog !== 'table_present') return { catalog, count: 0 };
  if (!readOnly) await tx`LOCK TABLE drizzle.__drizzle_migrations IN SHARE ROW EXCLUSIVE MODE`;
  const rows = await tx<{ id: number; hash: string; created_at: string }[]>`
    SELECT id, CASE WHEN octet_length(hash) = 64 THEN hash END AS hash, created_at::text
    FROM drizzle.__drizzle_migrations ORDER BY id LIMIT ${entries.length + 1}
  `;
  if (
    rows.some(
      (row, idx) =>
        row.id <= 0 ||
        row.hash !== entries[idx]?.hash ||
        row.created_at !== String(entries[idx]?.when)
    )
  )
    throw new Error('LEDGER_DIVERGENT');
  return { catalog, count: rows.length };
}

// Each operation must finish before the next starts on the locked session. A rejection
// skips all remaining operations and propagates to the transaction's rollback handler.
function runSequentially<T>(items: readonly T[], run: (item: T) => Promise<void>) {
  return items.reduce((previous, item) => previous.then(() => run(item)), Promise.resolve());
}

async function apply(
  tx: MigrationExecutionSql,
  journal: ReturnType<typeof readReleaseJournal>,
  from: number,
  through: number
) {
  // PostgreSQL searches pg_catalog first implicitly and creates unqualified objects in public.
  await tx`SET LOCAL search_path = public, pg_temp`;
  await runSequentially(journal.migrations.slice(from, through), async migration => {
    await runSequentially(migration.sql, async statement => {
      assertTransactionalMigration(statement);
      try {
        await tx.unsafe(statement);
      } catch (error) {
        throw new Error('MIGRATION_SQL_FAILED', { cause: error });
      }
      if (/^\s*RESET\s+statement_timeout\s*;\s*$/iu.test(statement))
        await tx`SET LOCAL statement_timeout = '45s'`;
    });
    await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
             VALUES (${migration.hash}, ${migration.folderMillis})`;
  });
  await tx`SET LOCAL search_path = pg_catalog, pg_temp`;
}

async function transaction<T>(
  sql: MigrationExecutionSql,
  execute: () => Promise<T>,
  readOnly = false
): Promise<T> {
  if (readOnly) await sql`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
  else await sql`BEGIN ISOLATION LEVEL READ COMMITTED`;
  let committing = false;
  try {
    await sql`SET LOCAL search_path = pg_catalog, pg_temp`;
    await sql`SET LOCAL statement_timeout = '45s'`;
    await sql`SET LOCAL idle_in_transaction_session_timeout = '45s'`;
    await sql`SET LOCAL standard_conforming_strings = on`;
    await sql`SET LOCAL synchronous_commit = on`;
    const [{ mode }] = await sql<{ mode: string }[]>`
      SELECT pg_catalog.current_setting('session_replication_role') AS mode
    `;
    if (mode !== 'origin') throw new Error('MIGRATION_REPLICATION_MODE_REJECTED');
    const result = await execute();
    committing = true;
    if ((await sql`COMMIT`).command !== 'COMMIT') throw new Error('COMMIT_NOT_CONFIRMED');
    return result;
  } catch (error) {
    try {
      await sql`ROLLBACK`;
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'RELEASE_TRANSACTION_OUTCOME_UNKNOWN');
    }
    if (committing) throw new Error('RELEASE_TRANSACTION_OUTCOME_UNKNOWN', { cause: error });
    throw error;
  }
}

function checkFresh(expiresAt: number) {
  if (Date.now() >= expiresAt) throw new Error('RECEIPT_EXPIRED');
}

export async function runReleaseMigrations(
  sql: MigrationExecutionSql,
  journal: ReturnType<typeof readReleaseJournal>,
  backendMarkerSha256: string,
  request: Request,
  scratch: boolean
) {
  const plan =
    request.mode === 'expand'
      ? null
      : planFrom(journal, backendMarkerSha256, request.plan?.beforeCount);
  if (
    request.mode !== 'expand' &&
    (!plan?.contract || JSON.stringify(request.plan) !== JSON.stringify(plan))
  )
    throw new Error('MANIFEST_PLAN_MISMATCH');

  // The same session lock covers the attempt reservation and migration transactions.
  // Recovery must acquire it too. The admin preflight closes the session after its final probe.
  await sql`SET lock_timeout = '15s'`;
  await sql`SET idle_session_timeout = '45s'`;
  const [{ pid }] = await sql<{ pid: number }[]>`
    SELECT pg_catalog.pg_advisory_lock(673167055, -773281837), pg_catalog.pg_backend_pid() AS pid
  `;
  const verifyAuthority = async () => {
    await verifyBackend(sql, backendMarkerSha256);
    await validatePublicSchema(sql, pid);
  };
  const inspect = async (readOnly = false) => {
    await verifyAuthority();
    return readLedger(sql, journal.entries, readOnly);
  };
  const checkShape = (count: number) =>
    runSequentially(journal.contracts, async idx => {
      if (count >= idx)
        await verifyReleaseShape(sql, journal.entries[idx].tag, count > idx, scratch);
    });
  if (request.mode === 'contract' && plan) {
    const { nonce, expiresAt, verifyLive } = request.approval;
    await transaction(sql, async () => {
      await verifyAuthority();
      if ((await inspectMigrationLedgerCatalog(sql)) !== 'table_present')
        throw new Error('EXPAND_PREFIX_MISMATCH');
      checkFresh(expiresAt);
      // Persist before inspecting the prefix or running contract SQL. A refusal after this
      // commit cannot make the authenticated invocation reusable.
      await consumeReleaseAttempt(sql, nonce);
    });
    await transaction(sql, async () => {
      if ((await inspect()).count !== plan.expandCount) throw new Error('EXPAND_PREFIX_MISMATCH');
      await checkShape(plan.expandCount);
      const [prepared] = await sql<{ present: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_prepared_xacts
          WHERE database = pg_catalog.current_database()) AS present
      `;
      if (prepared.present) throw new Error('PREPARED_TRANSACTIONS_PRESENT');
      await verifyLive();
      checkFresh(expiresAt);
      await apply(sql, journal, plan.expandCount, plan.finalCount);
      if ((await inspect()).count !== plan.finalCount) throw new Error('LEDGER_WRITE_MISMATCH');
      await checkShape(plan.finalCount);
      checkFresh(expiresAt);
    });
    return { plan, status: 'contracted' };
  }

  if (request.mode === 'recover' && plan) {
    return transaction(
      sql,
      async () => {
        const { count } = await inspect(true);
        if (count !== plan.expandCount && count !== plan.finalCount)
          throw new Error('RECOVERY_LEDGER_MISMATCH');
        await checkShape(count);
        if (count === plan.expandCount) throw new Error('RECOVERY_AT_EXPAND');
        return { plan, status: 'verified-committed' };
      },
      true
    );
  }

  return transaction(sql, async () => {
    const ledger = await inspect();
    await checkShape(ledger.count);
    const expand = planFrom(journal, backendMarkerSha256, ledger.count);
    await bootstrapMigrationLedger(sql, ledger.catalog);
    await apply(sql, journal, ledger.count, expand.expandCount);
    if ((await inspect()).count !== expand.expandCount) throw new Error('LEDGER_WRITE_MISMATCH');
    await checkShape(expand.expandCount);
    return { plan: expand, status: 'expanded' };
  });
}
