import type postgres from 'postgres';

export type MigrationExecutionSql = postgres.ReservedSql<Record<never, never>>;
export type MigrationExecutionErrorCode =
  | 'MIGRATION_EXECUTION_PLAN_CAPABILITY_REJECTED'
  | 'MIGRATION_EXECUTION_PLAN_DRIFT'
  | 'MIGRATION_EXECUTION_ABORTED'
  | 'MIGRATION_EXECUTION_LOCK_CONTENDED'
  | 'MIGRATION_EXECUTION_TIMEOUT'
  | 'MIGRATION_EXECUTION_TRANSACTION_FAILED'
  | 'MIGRATION_EXECUTION_SESSION_CHANGED'
  | 'MIGRATION_EXECUTION_PUBLIC_SCHEMA_REJECTED'
  | 'MIGRATION_EXECUTION_LEDGER_OWNER_REJECTED'
  | 'MIGRATION_EXECUTION_LEDGER_ACL_REJECTED'
  | 'MIGRATION_EXECUTION_LEDGER_SHAPE_REJECTED'
  | 'MIGRATION_EXECUTION_LEDGER_PREFIX_REJECTED'
  | 'MIGRATION_EXECUTION_BOOTSTRAP_FAILED'
  | 'MIGRATION_EXECUTION_CALLBACK_FAILED'
  | 'MIGRATION_EXECUTION_POSTCHECK_FAILED'
  | 'MIGRATION_EXECUTION_CLEANUP_FAILED';

export type MigrationExecutionSummary = Readonly<{
  contract_version: 'canonical_migration_execution_v1';
  callback_plan_sha256: string;
  applied_before: number;
  applied_now: number;
  applied_total: 93;
  session_reserved: true;
  transaction_committed: true;
  session_lock_released: true;
  execution_completed: true;
}>;
export type MigrationExecutionResult =
  | Readonly<{ ok: true; summary: MigrationExecutionSummary }>
  | Readonly<{ ok: false; error: Readonly<{ code: MigrationExecutionErrorCode }> }>;

export class MigrationExecutionFault extends Error {
  constructor(readonly code: MigrationExecutionErrorCode) {
    super(code);
    this.name = 'MigrationExecutionFault';
  }
}

export function migrationExecutionFailure(
  code: MigrationExecutionErrorCode
): MigrationExecutionResult {
  return Object.freeze({ ok: false, error: Object.freeze({ code }) });
}

export function migrationExecutionSuccess(
  callbackPlanSha256: string,
  appliedBefore: number
): MigrationExecutionResult {
  return Object.freeze({
    ok: true,
    summary: Object.freeze({
      contract_version: 'canonical_migration_execution_v1',
      callback_plan_sha256: callbackPlanSha256,
      applied_before: appliedBefore,
      applied_now: 93 - appliedBefore,
      applied_total: 93,
      session_reserved: true,
      transaction_committed: true,
      session_lock_released: true,
      execution_completed: true,
    }),
  });
}
