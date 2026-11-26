import { bootstrapMigrationLedger, validatePublicSchema } from './migration-execution-bootstrap';
import { inspectMigrationLedgerCatalog } from './migration-ledger-catalog';
import { consumeReleaseAttempt, verifyBackend } from './release-migration-catalog';
import { readReleaseJournal, sha256, type JournalEntry } from './release-migration-journal';
import { verifyReleaseShape } from './release-migration-shape';
import type { MigrationExecutionSql } from './migration-execution-contracts';
import { assertTransactionalMigration } from './release-migration-sql';

export { readReleaseJournal, sha256 };

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
