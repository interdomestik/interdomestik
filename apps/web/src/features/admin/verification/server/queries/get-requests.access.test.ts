import type { TenantTransaction } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  globalDbReads: [] as string[],
}));

vi.mock('@interdomestik/database', () => {
  const forbidden = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        hoisted.globalDbReads.push(String(prop));
        throw new Error(`global database handle used: ${String(prop)}`);
      },
    }
  );
  return { db: forbidden, dbRls: forbidden, withTenantContext: hoisted.withTenantContext };
});

import { createRecordingTenantTransaction } from '@/test/recording-tenant-transaction';
import { getVerificationRequests } from './get-requests';

function createRecordingTx(results: Array<unknown[] | Error>) {
  const { tx, select, executed } = createRecordingTenantTransaction(results);
  hoisted.withTenantContext.mockImplementation(
    async (_context: unknown, callback: (tx: TenantTransaction) => Promise<unknown>) => callback(tx)
  );
  return { executed, select };
}

function ctx(userRole: string, branchId: string | null = null) {
  return { tenantId: 'tenant-ks', userRole, scope: { branchId } };
}

describe('getVerificationRequests access', () => {
  beforeEach(() => {
    hoisted.withTenantContext.mockReset();
    hoisted.globalDbReads.length = 0;
  });

  it.each(['member', 'agent', 'global_support', 'auditor', 'unknown'])(
    'rejects %s with FORBIDDEN before any transaction',
    async role => {
      await expect(getVerificationRequests(ctx(role), { view: 'queue' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it.each(['branch_manager', 'staff'])(
    'returns the empty list for branchless %s before any transaction',
    async role => {
      await expect(getVerificationRequests(ctx(role), { view: 'queue' })).resolves.toEqual([]);
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it('reads the admin queue tenant-wide through the callback transaction', async () => {
    const rows = [{ id: 'attempt-1' }];
    const { executed } = createRecordingTx([rows]);

    const result = await getVerificationRequests(ctx('admin', 'branch-1'), { view: 'queue' });

    expect(result).toBe(rows);
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
      tenantId: 'tenant-ks',
      role: 'admin',
    });
    expect(executed).toHaveLength(1);
    const query = executed[0]!;
    expect(query.params).toEqual(
      expect.arrayContaining(['tenant-ks', 'cash', 'pending', 'needs_info'])
    );
    expect(query.params).not.toContain('branch-1');
    expect(query.params.at(-1)).toBe(100);
    expect(query.sql).toMatch(/"deleted_at" is null/);
    expect(query.sql).toMatch(/"is_resubmission" desc, .*"created_at" asc/);
    expect(hoisted.globalDbReads).toEqual([]);
  });

  it.each(['staff', 'branch_manager'])(
    'limits %s history to the own branch with the verifier join',
    async role => {
      const { executed } = createRecordingTx([[]]);

      await getVerificationRequests(ctx(role, 'branch-1'), { view: 'history', query: ' ana ' });

      expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
        tenantId: 'tenant-ks',
        role,
      });
      const query = executed[0]!;
      expect(query.params).toEqual(
        expect.arrayContaining(['tenant-ks', 'branch-1', 'succeeded', 'rejected', '%ana%'])
      );
      expect(query.params.at(-1)).toBe(50);
      expect(query.sql).toContain('"verifier"');
      expect(query.sql).toMatch(/"updated_at" desc/);
    }
  );

  it('propagates read failures from the transaction', async () => {
    const failure = new Error('permission denied for table lead_payment_attempts');
    createRecordingTx([failure]);

    await expect(getVerificationRequests(ctx('admin'), { view: 'queue' })).rejects.toBe(failure);
  });
});
