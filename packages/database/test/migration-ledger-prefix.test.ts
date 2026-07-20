import assert from 'node:assert/strict';
import test from 'node:test';

import type { LedgerRow } from '../src/migration-ledger-contracts';
import { validateMigrationLedgerPrefix } from '../src/migration-ledger-prefix';
import type { OwnedMigration } from '../src/migration-callback-plan-contracts';

const migrations: readonly OwnedMigration[] = Object.freeze(
  Array.from({ length: 93 }, (_, index) =>
    Object.freeze({
      bps: true as const,
      folderMillis: 1_700_000_000_000 + index,
      hash: index.toString(16).padStart(64, '0'),
      sql: Object.freeze([`statement-${index}`]),
    })
  )
);
const row = (migrationIndex: number, id = migrationIndex + 1): LedgerRow =>
  Object.freeze({
    id: String(id),
    hash: migrations[migrationIndex]?.hash ?? 'f'.repeat(64),
    created_at: String(migrations[migrationIndex]?.folderMillis ?? 1_800_000_000_000),
  });
const prefix = (length: number) => Array.from({ length }, (_, index) => row(index));
const rejected = (rows: readonly LedgerRow[], plan = migrations) =>
  assert.throws(() => validateMigrationLedgerPrefix(rows, plan), {
    code: 'MIGRATION_LEDGER_PREFIX_REJECTED',
  });

test('accepts every exact prefix and preserves safe serial gaps', () => {
  for (const length of [0, 1, 92, 93]) {
    const result = validateMigrationLedgerPrefix(prefix(length), migrations);
    assert.deepEqual(result, {
      ledgerState: length === 93 ? 'all_applied' : 'exact_prefix',
      appliedMigrations: length,
    });
    assert(Object.isFrozen(result));
  }
  assert.deepEqual(validateMigrationLedgerPrefix([row(0, 1), row(1, 3)], migrations), {
    ledgerState: 'exact_prefix',
    appliedMigrations: 2,
  });
});

test('rejects overflow, duplicate, reordered, unknown and missing-middle rows', () => {
  rejected([...prefix(93), row(0, 94)]);
  rejected([row(0, 1), row(1, 1)]);
  rejected([row(1, 1), row(0, 2)]);
  rejected([row(0, 1), row(2, 2)]);
  rejected([{ ...row(0), hash: 'f'.repeat(64) }]);
});

test('rejects malformed hashes, created_at values, ids and plan shapes', () => {
  for (const invalid of [
    { ...row(0), hash: null },
    { ...row(0), hash: 'a'.repeat(65) },
    { ...row(0), created_at: null },
    { ...row(0), created_at: '1700000000001' },
    { ...row(0), id: '0' },
    { ...row(0), id: '01' },
    { ...row(0), id: '2147483648' },
    { ...row(0), id: 'not-an-id' },
  ] satisfies LedgerRow[]) {
    rejected([invalid]);
  }
  rejected([], migrations.slice(0, 92));
  rejected(
    [],
    [{ ...migrations[0], folderMillis: Number.MAX_SAFE_INTEGER + 1 }, ...migrations.slice(1)]
  );
});
