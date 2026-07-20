import type postgres from 'postgres';

export type LedgerSql = postgres.ReservedSql<Record<never, never>>;
export type MigrationLedgerErrorCode =
  | 'MIGRATION_LEDGER_PLAN_CAPABILITY_REJECTED'
  | 'MIGRATION_LEDGER_ABORTED'
  | 'MIGRATION_LEDGER_TRANSACTION_FAILED'
  | 'MIGRATION_LEDGER_LOCK_TIMEOUT'
  | 'MIGRATION_LEDGER_CATALOG_REJECTED'
  | 'MIGRATION_LEDGER_OWNER_REJECTED'
  | 'MIGRATION_LEDGER_ACL_REJECTED'
  | 'MIGRATION_LEDGER_SHAPE_REJECTED'
  | 'MIGRATION_LEDGER_PREFIX_REJECTED'
  | 'MIGRATION_LEDGER_CLEANUP_FAILED';

export type LedgerRow = Readonly<{
  id: string;
  hash: string | null;
  created_at: string | null;
}>;
export type LedgerCatalogProbe = Readonly<{
  schema_count: number;
  table_count: number;
  sequence_count: number;
  schema_owner_ok: boolean | null;
  schema_acl_ok: boolean | null;
  table_owner_ok: boolean | null;
  sequence_owner_ok: boolean | null;
  table_acl_ok: boolean | null;
  sequence_acl_ok: boolean | null;
  table_shape_ok: boolean | null;
}>;
export type LedgerCatalogState = 'schema_absent' | 'table_absent' | 'table_present';
export type LedgerPrefixResult = Readonly<{
  ledgerState: 'exact_prefix' | 'all_applied';
  appliedMigrations: number;
}>;
export type MigrationLedgerSummary = Readonly<{
  contract_version: 'canonical_migration_ledger_inspection_v1';
  ledger_state: 'schema_absent' | 'table_absent' | 'exact_prefix' | 'all_applied';
  applied_migrations: number;
  pending_migrations: number;
  callback_plan_sha256: string;
  read_only: true;
  execution_authorized: false;
}>;
export type MigrationLedgerResult =
  | Readonly<{ ok: true; summary: MigrationLedgerSummary }>
  | Readonly<{ ok: false; error: Readonly<{ code: MigrationLedgerErrorCode }> }>;

export class MigrationLedgerFault extends Error {
  constructor(readonly code: MigrationLedgerErrorCode) {
    super(code);
    this.name = 'MigrationLedgerFault';
  }
}

export function migrationLedgerFailure(code: MigrationLedgerErrorCode): MigrationLedgerResult {
  return Object.freeze({ ok: false, error: Object.freeze({ code }) });
}
