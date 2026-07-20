import { readMigrationCallbackPlanState } from './migration-callback-plan-capability';
import { inspectMigrationLedgerCatalog, readMigrationLedgerRows } from './migration-ledger-catalog';
import {
  MigrationLedgerFault,
  migrationLedgerFailure,
  type LedgerCatalogState,
  type LedgerPrefixResult,
  type LedgerSql,
  type MigrationLedgerErrorCode,
  type MigrationLedgerResult,
  type MigrationLedgerSummary,
} from './migration-ledger-contracts';
import { validateMigrationLedgerPrefix } from './migration-ledger-prefix';

type Stage = 'transaction' | 'lock' | 'catalog' | 'prefix';
const abortCheck = (signal: AbortSignal): void => {
  if (signal.aborted) throw new MigrationLedgerFault('MIGRATION_LEDGER_ABORTED');
};
async function checked<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  abortCheck(signal);
  const result = await operation();
  abortCheck(signal);
  return result;
}
function sqlState(error: unknown): string | null {
  try {
    return error &&
      typeof error === 'object' &&
      typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null;
  } catch {
    return null;
  }
}
function failureCode(error: unknown, stage: Stage, signal: AbortSignal): MigrationLedgerErrorCode {
  if (signal.aborted) return 'MIGRATION_LEDGER_ABORTED';
  if (error instanceof MigrationLedgerFault) return error.code;
  if (stage === 'lock' && sqlState(error) === '55P03') return 'MIGRATION_LEDGER_LOCK_TIMEOUT';
  if (stage === 'catalog') return 'MIGRATION_LEDGER_CATALOG_REJECTED';
  if (stage === 'prefix') return 'MIGRATION_LEDGER_PREFIX_REJECTED';
  return 'MIGRATION_LEDGER_TRANSACTION_FAILED';
}
function summary(
  catalog: LedgerCatalogState,
  prefix: LedgerPrefixResult,
  callbackPlanSha256: string
): MigrationLedgerSummary {
  const ledgerState = catalog === 'table_present' ? prefix.ledgerState : catalog;
  const applied = catalog === 'table_present' ? prefix.appliedMigrations : 0;
  return Object.freeze({
    contract_version: 'canonical_migration_ledger_inspection_v1',
    ledger_state: ledgerState,
    applied_migrations: applied,
    pending_migrations: 93 - applied,
    callback_plan_sha256: callbackPlanSha256,
    read_only: true,
    execution_authorized: false,
  });
}

export async function inspectMigrationLedger(
  capability: unknown,
  sql: LedgerSql,
  signal: AbortSignal
): Promise<MigrationLedgerResult> {
  const state = readMigrationCallbackPlanState(capability);
  if (!state) return migrationLedgerFailure('MIGRATION_LEDGER_PLAN_CAPABILITY_REJECTED');
  let emptyPrefix: LedgerPrefixResult;
  try {
    emptyPrefix = validateMigrationLedgerPrefix([], state.migrations);
  } catch {
    return migrationLedgerFailure('MIGRATION_LEDGER_PREFIX_REJECTED');
  }
  if (signal.aborted) return migrationLedgerFailure('MIGRATION_LEDGER_ABORTED');
  let stage: Stage = 'transaction';
  let began = false;
  let committed = false;
  try {
    await sql`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
    began = true;
    abortCheck(signal);
    await checked(signal, () => sql`SET LOCAL search_path = pg_catalog, pg_temp`);
    await checked(signal, () => sql`SET LOCAL lock_timeout = '2s'`);
    await checked(signal, () => sql`SET LOCAL statement_timeout = '5s'`);
    await checked(signal, () => sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
    stage = 'lock';
    await checked(signal, () => sql`SELECT pg_advisory_xact_lock(673167055, -773281837)`);
    stage = 'transaction';
    const firstPid = await checked(
      signal,
      () => sql<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`
    );
    if (!Number.isInteger(firstPid[0]?.pid))
      throw new MigrationLedgerFault('MIGRATION_LEDGER_TRANSACTION_FAILED');
    stage = 'catalog';
    const catalog = await checked(signal, () => inspectMigrationLedgerCatalog(sql));
    let prefix = emptyPrefix;
    if (catalog === 'table_present') {
      stage = 'prefix';
      const rows = await checked(signal, () => readMigrationLedgerRows(sql));
      prefix = validateMigrationLedgerPrefix(rows, state.migrations);
    }
    stage = 'transaction';
    const finalPid = await checked(
      signal,
      () => sql<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`
    );
    if (finalPid[0]?.pid !== firstPid[0]?.pid)
      throw new MigrationLedgerFault('MIGRATION_LEDGER_TRANSACTION_FAILED');
    abortCheck(signal);
    await sql`COMMIT`;
    committed = true;
    abortCheck(signal);
    return Object.freeze({ ok: true, summary: summary(catalog, prefix, state.callbackPlanSha256) });
  } catch (error) {
    const code = failureCode(error, stage, signal);
    if (began && !committed) {
      try {
        await sql`ROLLBACK`;
      } catch {
        return migrationLedgerFailure('MIGRATION_LEDGER_CLEANUP_FAILED');
      }
    }
    return migrationLedgerFailure(code);
  }
}
