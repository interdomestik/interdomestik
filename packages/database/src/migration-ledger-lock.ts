import {
  MigrationLedgerFault,
  type LedgerSql,
  type MigrationLedgerErrorCode,
} from './migration-ledger-contracts';

type LockRow = Readonly<{ pid: number }>;
type UnlockRow = Readonly<{ unlocked: boolean; pid: number }>;
export type MigrationLedgerReadLock = Readonly<{ pid: number }>;

const abort = (signal: AbortSignal): void => {
  if (signal.aborted) throw new MigrationLedgerFault('MIGRATION_LEDGER_ABORTED');
};
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
async function guarded(signal: AbortSignal, operation: () => Promise<unknown>): Promise<void> {
  abort(signal);
  await operation();
  abort(signal);
}
function acquisitionCode(error: unknown, signal: AbortSignal): MigrationLedgerErrorCode {
  if (signal.aborted) return 'MIGRATION_LEDGER_ABORTED';
  if (error instanceof MigrationLedgerFault) return error.code;
  if (sqlState(error) === '55P03') return 'MIGRATION_LEDGER_LOCK_TIMEOUT';
  return 'MIGRATION_LEDGER_TRANSACTION_FAILED';
}

export async function releaseMigrationLedgerReadLock(sql: LedgerSql, pid: number): Promise<void> {
  const rows = await sql<UnlockRow[]>`
    SELECT pg_catalog.pg_advisory_unlock_shared(673167055, -773281837) AS unlocked,
      pg_catalog.pg_backend_pid()::int AS pid
  `;
  if (rows.length !== 1 || rows[0]?.unlocked !== true || rows[0].pid !== pid)
    throw new MigrationLedgerFault('MIGRATION_LEDGER_CLEANUP_FAILED');
}

export async function acquireMigrationLedgerReadLock(
  sql: LedgerSql,
  signal: AbortSignal
): Promise<MigrationLedgerReadLock> {
  let transactionOpen = false;
  let acquired = false;
  let pid = 0;
  let lockStage = false;
  try {
    abort(signal);
    await sql`BEGIN READ ONLY`;
    transactionOpen = true;
    await guarded(signal, () => sql`SET LOCAL search_path = pg_catalog, pg_temp`);
    await guarded(signal, () => sql`SET LOCAL lock_timeout = '2s'`);
    await guarded(signal, () => sql`SET LOCAL statement_timeout = '5s'`);
    await guarded(signal, () => sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
    lockStage = true;
    const rows = await sql<LockRow[]>`
      SELECT pg_catalog.pg_advisory_lock_shared(673167055, -773281837),
        pg_catalog.pg_backend_pid()::int AS pid
    `;
    acquired = true;
    if (Number.isInteger(rows[0]?.pid)) pid = rows[0].pid;
    lockStage = false;
    abort(signal);
    if (rows.length !== 1 || !Number.isInteger(rows[0]?.pid))
      throw new MigrationLedgerFault('MIGRATION_LEDGER_TRANSACTION_FAILED');
    await sql`COMMIT`;
    transactionOpen = false;
    abort(signal);
    return Object.freeze({ pid });
  } catch (error) {
    let cleanupFailed = false;
    if (transactionOpen)
      try {
        await sql`ROLLBACK`;
      } catch {
        cleanupFailed = true;
      }
    if (acquired)
      try {
        await releaseMigrationLedgerReadLock(sql, pid);
      } catch {
        cleanupFailed = true;
      }
    if (cleanupFailed) throw new MigrationLedgerFault('MIGRATION_LEDGER_CLEANUP_FAILED');
    if (lockStage && sqlState(error) === '55P03')
      throw new MigrationLedgerFault('MIGRATION_LEDGER_LOCK_TIMEOUT');
    throw new MigrationLedgerFault(acquisitionCode(error, signal));
  }
}
