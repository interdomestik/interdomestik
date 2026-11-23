import type { TenantTransaction } from '@interdomestik/database';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { DrizzleQueryError, sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordSale, recordSaleInTx } from './record-sale';
import { claimSale, SaleInputRefusal } from './sale-claim';

vi.mock('@interdomestik/database/tenant-authority', () => ({ readTenantAuthority: vi.fn() }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));

const actor = { id: 'seller-1', tenantId: 'tenant-1' };
const role = 'tenant_admin';
const input = {
  buyer: { memberUserId: 'member-1' },
  planVersionId: 'version-1',
  termsVersion: 'v1',
  rateId: 'rate-1',
  amountMkdMinor: 100n,
  channel: 'cash',
  operationKey: 'operation-1',
};
const claimsCheck = 'membership_sale_claims_operation_key_check';
const salesCheck = 'membership_sales_operation_key_check';
const issues = { operationKey: 'too_big' };

function postgresError(code: string, constraintName: string) {
  return Object.assign(new Error('Synthetic PostgreSQL error'), {
    code,
    constraint_name: constraintName,
  });
}

function claimTransaction(error: Error) {
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(error) }),
    }),
  });
  const transaction = vi.fn((run: (tx: { insert: typeof insert }) => Promise<unknown>) =>
    run({ insert })
  );
  const execute = vi
    .fn<(query: SQL) => Promise<unknown>>()
    .mockResolvedValueOnce([
      { isolation: 'read committed', home: actor.tenantId, access: actor.tenantId, role },
    ]);
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ branchId: null }]) }),
  });
  const tx = { transaction, execute, select } as unknown as TenantTransaction;
  return { tx, transaction, execute, insert };
}

describe('claimSale database errors', () => {
  it.each([claimsCheck, salesCheck])('maps the named CHECK %s to a typed refusal', async name => {
    const error = new DrizzleQueryError('insert', [], postgresError('23514', name));
    const { tx, transaction, insert } = claimTransaction(error);
    const claim = claimSale(tx, actor.tenantId, input.operationKey, sql`'test-digest'`);

    await expect(claim).rejects.toBeInstanceOf(SaleInputRefusal);
    await expect(claim).rejects.toMatchObject({ issues });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it.each([
    postgresError('23514', 'membership_sale_claims_hash_check'),
    postgresError('23505', claimsCheck),
  ])('rethrows $code for $constraint_name unchanged', async cause => {
    const error = new DrizzleQueryError('insert', [], cause);
    const { tx } = claimTransaction(error);

    await expect(
      claimSale(tx, actor.tenantId, input.operationKey, sql`'test-digest'`)
    ).rejects.toBe(error);
  });
});

describe('sale command database refusal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(readTenantAuthority).mockReturnValue({
      purpose: 'session',
      tenantId: actor.tenantId,
      accessTenantId: actor.tenantId,
      principal: { userId: actor.id, role, branchId: null, agentId: null },
      expiresAtMs: Number.MAX_SAFE_INTEGER,
    });
  });

  it.each(['recordSale', 'recordSaleInTx'])(
    '%s returns the exact refusal after rolling back the sale',
    async entry => {
      const { tx, execute } = claimTransaction(postgresError('23514', claimsCheck));
      const authority = mintTestTenantAuthority(actor.tenantId);
      vi.mocked(withTenantAuthority).mockImplementationOnce(async (_authority, run) => run(tx));
      const result =
        entry === 'recordSale'
          ? await recordSale(authority, input, actor)
          : await recordSaleInTx(tx, authority, input, actor);

      expect(result).toStrictEqual({ ok: false, code: 'invalid', issues });
      const dialect = new PgDialect();
      expect(execute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql)).toEqual([
        expect.stringContaining("current_setting('transaction_isolation')"),
        'savepoint wp07_sale',
        'set constraints public.membership_claims_require_sale deferred',
        'rollback to savepoint wp07_sale',
        'release savepoint wp07_sale',
      ]);
    }
  );
});
