import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleE2EBranchOperation } from './_core';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  execute: vi.fn(),
  setting: vi.fn(),
  active: vi.fn(),
  values: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({ db: { transaction: mocks.transaction } }));
vi.mock('@interdomestik/database', async () => ({
  ...(await import('@interdomestik/database/schema')),
  ...(await import('drizzle-orm')),
}));

const input = {
  action: 'create',
  name: 'Test Branch',
  code: 'TEST',
  tenantId: 'tenant_ks',
} as const;
const dialect = new PgDialect();

describe('E2E branch create policy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.execute.mockResolvedValue([]);
    mocks.setting.mockResolvedValue(undefined);
    mocks.active.mockResolvedValue([{ id: 'existing' }]);
    mocks.values.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(callback =>
      callback({
        execute: mocks.execute,
        query: {
          tenantSettings: { findFirst: mocks.setting },
          branches: { findMany: mocks.active },
        },
        insert: () => ({ values: mocks.values }),
      })
    );
  });

  it('refuses a second active branch and reads policy only after taking the tenant lock', async () => {
    expect(await handleE2EBranchOperation(input)).toMatchObject({
      success: false,
      code: 'single_branch_limit',
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(dialect.sqlToQuery(mocks.execute.mock.calls[0][0])).toMatchObject({
      sql: 'select pg_advisory_xact_lock(hashtextextended($1, 0))',
      params: ['pilot-single-active-branch:tenant_ks'],
    });
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setting.mock.invocationCallOrder[0]
    );
    expect(dialect.sqlToQuery(mocks.active.mock.calls[0][0].where).params).toEqual([
      'tenant_ks',
      true,
    ]);
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it('allows a first active branch inside the same locked transaction', async () => {
    mocks.active.mockResolvedValue([]);
    expect(await handleE2EBranchOperation(input)).toMatchObject({ success: true });
    expect(mocks.active.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.values.mock.invocationCallOrder[0]
    );
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_ks',
        isActive: true,
      })
    );
  });

  it('preserves multi-branch E2E seed opt-in', async () => {
    mocks.setting.mockResolvedValue({ value: { enabled: true } });
    expect(await handleE2EBranchOperation(input)).toMatchObject({ success: true });
    expect(mocks.active).not.toHaveBeenCalled();
    expect(mocks.values).toHaveBeenCalledTimes(1);
  });

  it.each([false, 'true', undefined])(
    'does not accept a malformed or disabled opt-in (%s)',
    async enabled => {
      mocks.setting.mockResolvedValue({ value: { enabled } });
      expect(await handleE2EBranchOperation(input)).toMatchObject({ code: 'single_branch_limit' });
      expect(mocks.values).not.toHaveBeenCalled();
    }
  );

  it('permits an explicitly inactive branch while retaining the lock', async () => {
    expect(await handleE2EBranchOperation({ ...input, isActive: false })).toMatchObject({
      success: true,
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });

  it('rejects a missing tenant before any transaction or write', async () => {
    await expect(handleE2EBranchOperation({ ...input, tenantId: undefined })).rejects.toThrow(
      'Missing fields'
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
