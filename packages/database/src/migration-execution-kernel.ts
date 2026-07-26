import { inspectMigrationLedgerCatalog, readMigrationLedgerRows } from './migration-ledger-catalog';
import { MigrationLedgerFault } from './migration-ledger-contracts';
import { validateMigrationLedgerPrefix } from './migration-ledger-prefix';
import { bootstrapMigrationLedger, validatePublicSchema } from './migration-execution-bootstrap';
// prettier-ignore
import { MigrationExecutionFault, migrationExecutionFailure, migrationExecutionSuccess, type MigrationExecutionErrorCode, type MigrationExecutionResult, type MigrationExecutionSql } from './migration-execution-contracts';
// prettier-ignore
import { pendingMigrationCallbacks, readAuthenticatedExecutionPlan, rebuildMigrationExecutionPlan } from './migration-execution-plan';

// prettier-ignore
type Stage = 'lock' | 'transaction' | 'public' | 'ledger' | 'bootstrap' | 'callback' | 'postcheck';
type LockRow = Readonly<{ locked: boolean; pid: number }>;
type UnlockRow = Readonly<{ unlocked: boolean; pid: number }>;
// prettier-ignore
const abort = (signal: AbortSignal): void => { if (signal.aborted) throw new MigrationExecutionFault('MIGRATION_EXECUTION_ABORTED'); };
// prettier-ignore
async function checked<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> { abort(signal); const value = await operation(); abort(signal); return value; }
// prettier-ignore
function sqlState(error: unknown): string | null {
  try {
    return error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : null;
  } catch {
    return null;
  }
}
// prettier-ignore
function ledgerCode(code: string): MigrationExecutionErrorCode {
  if (code.includes('OWNER')) return 'MIGRATION_EXECUTION_LEDGER_OWNER_REJECTED';
  if (code.includes('ACL')) return 'MIGRATION_EXECUTION_LEDGER_ACL_REJECTED';
  if (code.includes('SHAPE') || code.includes('CATALOG')) return 'MIGRATION_EXECUTION_LEDGER_SHAPE_REJECTED';
  return 'MIGRATION_EXECUTION_LEDGER_PREFIX_REJECTED';
}
// prettier-ignore
function failureCode(error: unknown, stage: Stage, signal: AbortSignal): MigrationExecutionErrorCode {
  if (signal.aborted) return 'MIGRATION_EXECUTION_ABORTED';
  if (error instanceof MigrationExecutionFault) return error.code;
  if (error instanceof MigrationLedgerFault) return ledgerCode(error.code);
  if (['57014', '55P03'].includes(sqlState(error) ?? '')) return 'MIGRATION_EXECUTION_TIMEOUT';
  if (stage === 'public') return 'MIGRATION_EXECUTION_PUBLIC_SCHEMA_REJECTED';
  if (stage === 'ledger') return 'MIGRATION_EXECUTION_LEDGER_PREFIX_REJECTED';
  if (stage === 'bootstrap') return 'MIGRATION_EXECUTION_BOOTSTRAP_FAILED';
  if (stage === 'callback') return 'MIGRATION_EXECUTION_CALLBACK_FAILED';
  if (stage === 'postcheck') return 'MIGRATION_EXECUTION_POSTCHECK_FAILED';
  return 'MIGRATION_EXECUTION_TRANSACTION_FAILED';
}
async function unlock(sql: MigrationExecutionSql, pid: number): Promise<void> {
  const rows = await sql<UnlockRow[]>`
    SELECT pg_advisory_unlock(673167055, -773281837) AS unlocked,
      pg_backend_pid()::int AS pid
  `;
  // prettier-ignore
  if (rows.length !== 1 || rows[0]?.unlocked !== true || rows[0].pid !== pid) throw new MigrationExecutionFault('MIGRATION_EXECUTION_CLEANUP_FAILED');
}

export async function executeMigrationKernel(
  capability: unknown,
  sql: MigrationExecutionSql,
  signal: AbortSignal
): Promise<MigrationExecutionResult> {
  let state;
  try {
    state = readAuthenticatedExecutionPlan(capability);
  } catch {
    return migrationExecutionFailure('MIGRATION_EXECUTION_PLAN_CAPABILITY_REJECTED');
  }
  if (signal.aborted) return migrationExecutionFailure('MIGRATION_EXECUTION_ABORTED');
  // prettier-ignore
  let acquired = false, began = false, committed = false, pid = 0, stage: Stage = 'lock';
  try {
    abort(signal);
    const lock = await sql<LockRow[]>`
      SELECT pg_try_advisory_lock(673167055, -773281837) AS locked,
        pg_backend_pid()::int AS pid
    `;
    // prettier-ignore
    if (lock.length !== 1 || !Number.isInteger(lock[0]?.pid)) throw new MigrationExecutionFault('MIGRATION_EXECUTION_TRANSACTION_FAILED');
    if (lock[0]?.locked !== true)
      throw new MigrationExecutionFault('MIGRATION_EXECUTION_LOCK_CONTENDED');
    acquired = true;
    pid = lock[0].pid;
    abort(signal);
    stage = 'transaction';
    await checked(signal, () => sql`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ WRITE`);
    began = true;
    await checked(signal, () => sql`SET LOCAL search_path = pg_catalog, pg_temp`);
    await checked(signal, () => sql`SET LOCAL lock_timeout = '10s'`);
    await checked(signal, () => sql`SET LOCAL statement_timeout = '60s'`);
    await checked(signal, () => sql`SET LOCAL idle_in_transaction_session_timeout = '30s'`);
    stage = 'public';
    await checked(signal, () => validatePublicSchema(sql, pid));
    await checked(signal, () => sql`SET LOCAL search_path = pg_catalog, public, pg_temp`);
    state = await rebuildMigrationExecutionPlan(state);
    stage = 'ledger';
    const catalog = await checked(signal, () => inspectMigrationLedgerCatalog(sql));
    const initialRows =
      catalog === 'table_present' ? await checked(signal, () => readMigrationLedgerRows(sql)) : [];
    const initial = validateMigrationLedgerPrefix(initialRows, state.migrations);
    stage = 'bootstrap';
    await checked(signal, () => bootstrapMigrationLedger(sql, catalog));
    stage = 'callback';
    const callbacks = pendingMigrationCallbacks(state, initial.appliedMigrations);
    for (const item of callbacks) await checked(signal, () => sql.unsafe(item));
    stage = 'postcheck';
    if ((await checked(signal, () => inspectMigrationLedgerCatalog(sql))) !== 'table_present')
      throw new MigrationExecutionFault('MIGRATION_EXECUTION_POSTCHECK_FAILED');
    const final = validateMigrationLedgerPrefix(
      await checked(signal, () => readMigrationLedgerRows(sql)),
      state.migrations
    );
    if (final.ledgerState !== 'all_applied')
      throw new MigrationExecutionFault('MIGRATION_EXECUTION_POSTCHECK_FAILED');
    await rebuildMigrationExecutionPlan(state);
    stage = 'transaction';
    const finalPid = await checked(
      signal,
      () => sql<{ pid: number }[]>`
      SELECT pg_backend_pid()::int AS pid
    `
    );
    if (finalPid.length !== 1 || finalPid[0]?.pid !== pid)
      throw new MigrationExecutionFault('MIGRATION_EXECUTION_SESSION_CHANGED');
    abort(signal);
    await sql`COMMIT`;
    committed = true;
    began = false;
    await unlock(sql, pid);
    acquired = false;
    return migrationExecutionSuccess(state.callbackPlanSha256, initial.appliedMigrations);
  } catch (error) {
    const code = failureCode(error, stage, signal);
    let cleanupFailed = false;
    if (began && !committed)
      try {
        await sql`ROLLBACK`;
      } catch {
        cleanupFailed = true;
      }
    if (acquired)
      try {
        await unlock(sql, pid);
      } catch {
        cleanupFailed = true;
      }
    return migrationExecutionFailure(cleanupFailed ? 'MIGRATION_EXECUTION_CLEANUP_FAILED' : code);
  }
}
