import { inspectMigrationLedgerCatalog, readMigrationLedgerRows } from './migration-ledger-catalog';
import { MigrationLedgerFault } from './migration-ledger-contracts';
import { validateMigrationLedgerPrefix } from './migration-ledger-prefix';
import { bootstrapMigrationLedger, validatePublicSchema } from './migration-execution-bootstrap';
// prettier-ignore
import { MigrationExecutionFault, migrationExecutionFailure, migrationExecutionSuccess, type MigrationExecutionErrorCode, type MigrationExecutionResult, type MigrationExecutionSql } from './migration-execution-contracts';
// prettier-ignore
import { pendingMigrationCallbacks, readAuthenticatedExecutionPlan, rebuildMigrationExecutionPlan } from './migration-execution-plan';
// prettier-ignore
type Stage = 'lock' | 'transaction' | 'public' | 'ledger' | 'bootstrap' | 'callback' | 'postcheck' | 'cleanup';
type LockRow = Readonly<{ locked: boolean; pid: number }>;
type UnlockRow = Readonly<{ unlocked: boolean; pid: number }>;
type ExecutionState = ReturnType<typeof readAuthenticatedExecutionPlan>;
type TransactionResult = Readonly<{ state: ExecutionState; applied: number }>;
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
  if (stage === 'cleanup') return 'MIGRATION_EXECUTION_CLEANUP_FAILED';
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
    SELECT pg_catalog.pg_advisory_unlock(673167055, -773281837) AS unlocked,
      pg_catalog.pg_backend_pid()::int AS pid
  `;
  // prettier-ignore
  if (rows.length !== 1 || rows[0]?.unlocked !== true || rows[0].pid !== pid) throw new MigrationExecutionFault('MIGRATION_EXECUTION_CLEANUP_FAILED');
}
// prettier-ignore
async function runTransaction(state: ExecutionState, sql: MigrationExecutionSql, signal: AbortSignal, pid: number): Promise<TransactionResult> {
  let stage: Stage = 'transaction';
  try {
    await checked(signal, () => sql`SET LOCAL search_path = pg_catalog, pg_temp`);
    await checked(signal, () => sql`SET LOCAL lock_timeout = '10s'`);
    await checked(signal, () => sql`SET LOCAL statement_timeout = '60s'`);
    await checked(signal, () => sql`SET LOCAL idle_in_transaction_session_timeout = '30s'`);
    stage = 'public';
    await checked(signal, () => validatePublicSchema(sql, pid));
    state = await rebuildMigrationExecutionPlan(state);
    stage = 'ledger';
    const catalog = await checked(signal, () => inspectMigrationLedgerCatalog(sql));
    const rows = catalog === 'table_present' ? await checked(signal, () => readMigrationLedgerRows(sql)) : [];
    const initial = validateMigrationLedgerPrefix(rows, state.migrations);
    stage = 'bootstrap';
    await checked(signal, () => bootstrapMigrationLedger(sql, catalog));
    const callbacks = pendingMigrationCallbacks(state, initial.appliedMigrations);
    if (callbacks.length > 0) {
      stage = 'public';
      await checked(signal, () => validatePublicSchema(sql, pid));
      stage = 'callback';
      await checked(signal, () => sql`SET LOCAL search_path = public, pg_temp`);
    }
    for (const item of callbacks) await checked(signal, () => sql.unsafe(item));
    stage = 'postcheck';
    await checked(signal, () => sql`SET LOCAL search_path = pg_catalog, pg_temp`);
    if ((await checked(signal, () => inspectMigrationLedgerCatalog(sql))) !== 'table_present') throw new MigrationExecutionFault('MIGRATION_EXECUTION_POSTCHECK_FAILED');
    const final = validateMigrationLedgerPrefix(await checked(signal, () => readMigrationLedgerRows(sql)), state.migrations);
    if (final.ledgerState !== 'all_applied') throw new MigrationExecutionFault('MIGRATION_EXECUTION_POSTCHECK_FAILED');
    await rebuildMigrationExecutionPlan(state);
    const finalPid = await checked(signal, () => sql<{ pid: number }[]>`SELECT pg_catalog.pg_backend_pid()::int AS pid`);
    if (finalPid.length !== 1 || finalPid[0]?.pid !== pid) throw new MigrationExecutionFault('MIGRATION_EXECUTION_SESSION_CHANGED');
    return Object.freeze({ state, applied: initial.appliedMigrations });
  } catch (error) {
    throw new MigrationExecutionFault(failureCode(error, stage, signal));
  }
}
// prettier-ignore
async function cleanup(sql: MigrationExecutionSql, pid: number, rollback: boolean, release: boolean): Promise<boolean> {
  let failed = false;
  // prettier-ignore
  if (rollback) try { await sql`ROLLBACK`; } catch { failed = true; }
  // prettier-ignore
  if (release) try { await unlock(sql, pid); } catch { failed = true; }
  return failed;
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
  let acquired = false, began = false, committed = false, cleanupStage = false, pid = 0;
  try {
    abort(signal);
    const lock = await sql<LockRow[]>`
      SELECT pg_catalog.pg_try_advisory_lock(673167055, -773281837) AS locked,
        pg_catalog.pg_backend_pid()::int AS pid
    `;
    acquired = lock[0]?.locked === true;
    if (Number.isInteger(lock[0]?.pid)) pid = lock[0].pid;
    // prettier-ignore
    if (lock.length !== 1 || !Number.isInteger(lock[0]?.pid)) throw new MigrationExecutionFault('MIGRATION_EXECUTION_TRANSACTION_FAILED');
    if (lock[0]?.locked !== true)
      throw new MigrationExecutionFault('MIGRATION_EXECUTION_LOCK_CONTENDED');
    abort(signal);
    await checked(signal, () => sql`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ WRITE`);
    began = true;
    const transaction = await runTransaction(state, sql, signal, pid);
    abort(signal);
    await sql`COMMIT`;
    [committed, began, cleanupStage, acquired] = [true, false, true, false];
    await unlock(sql, pid);
    return migrationExecutionSuccess(transaction.state.callbackPlanSha256, transaction.applied);
  } catch (error) {
    // prettier-ignore
    const code = cleanupStage ? 'MIGRATION_EXECUTION_CLEANUP_FAILED' : failureCode(error, 'transaction', signal);
    const cleanupFailed = await cleanup(sql, pid, began && !committed, acquired);
    return migrationExecutionFailure(cleanupFailed ? 'MIGRATION_EXECUTION_CLEANUP_FAILED' : code);
  }
}
