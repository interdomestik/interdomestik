import type { OwnedMigration } from './migration-callback-plan-contracts';
import {
  MigrationLedgerFault,
  type LedgerPrefixResult,
  type LedgerRow,
} from './migration-ledger-contracts';

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[1-9]\d{0,9}$/;
const MAX_INT4 = 2_147_483_647n;
const reject = (): never => {
  throw new MigrationLedgerFault('MIGRATION_LEDGER_PREFIX_REJECTED');
};

function validatePlan(migrations: readonly OwnedMigration[]): void {
  if (migrations.length !== 93) reject();
  for (const migration of migrations) {
    if (
      migration.bps !== true ||
      !Number.isSafeInteger(migration.folderMillis) ||
      migration.folderMillis <= 0 ||
      !HASH.test(migration.hash)
    )
      reject();
  }
}

export function validateMigrationLedgerPrefix(
  rows: readonly LedgerRow[],
  migrations: readonly OwnedMigration[]
): LedgerPrefixResult {
  validatePlan(migrations);
  if (rows.length > migrations.length) reject();
  let previous = 0n;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const migration = migrations[index];
    if (!row || !migration || !ID.test(row.id)) reject();
    const id = BigInt(row.id);
    if (id > MAX_INT4 || id <= previous) reject();
    if (row.hash !== migration.hash || row.created_at !== String(migration.folderMillis)) reject();
    previous = id;
  }
  return Object.freeze({
    ledgerState: rows.length === migrations.length ? 'all_applied' : 'exact_prefix',
    appliedMigrations: rows.length,
  });
}
