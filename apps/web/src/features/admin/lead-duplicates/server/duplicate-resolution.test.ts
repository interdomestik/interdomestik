import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selects: [] as unknown[][],
  inserts: [] as unknown[][],
  insertedValues: [] as Record<string, unknown>[],
  transactions: 0,
}));

/** A query-builder double: every chained call returns itself, awaiting yields `result`. */
function chain(result: unknown): unknown {
  const settled = Promise.resolve(result);
  return new Proxy(
    {},
    {
      get: (_target, key) => (key === 'then' ? settled.then.bind(settled) : () => chain(result)),
    }
  );
}

const tx = {
  select: () => chain(mocks.selects.shift() ?? []),
  insert: () => ({
    values: (values: Record<string, unknown>) => {
      mocks.insertedValues.push(values);
      return chain(mocks.inserts.shift() ?? []);
    },
  }),
};

vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: (authority: { tenantId: string }) => ({ tenantId: authority.tenantId }),
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: (_authority: unknown, action: (t: typeof tx) => Promise<unknown>) => {
    mocks.transactions += 1;
    return action(tx);
  },
}));
vi.mock('@/features/agent/leads/server/lead-duplicate-referral', () => ({
  LEAD_DUPLICATE_REFERRAL_ACTION: 'AGENT_LEAD_POSSIBLE_DUPLICATE',
}));

import { duplicateResolutionId, resolveDuplicateReferralCore } from './duplicate-resolution';

const authority = { tenantId: 'tenant_ks' } as never;
const admin = {
  authority,
  userRole: 'tenant_admin',
  scope: { branchId: null },
  actorId: 'u-admin',
};
const manager = {
  ...admin,
  userRole: 'branch_manager',
  scope: { branchId: 'b-1' },
  actorId: 'u-bm',
};
const input = { referralId: 'lead-dup-1', outcome: 'kept_existing' };

beforeEach(() => {
  mocks.selects.length = 0;
  mocks.inserts.length = 0;
  mocks.insertedValues.length = 0;
  mocks.transactions = 0;
});

describe('resolveDuplicateReferralCore (IDA-CRM-003)', () => {
  it('records one append-only resolution with the reviewer and the exercised role', async () => {
    mocks.selects.push([{ submittingBranchId: 'b-1', leadBranchId: 'b-2' }]);
    mocks.inserts.push([{ id: 'x' }]);

    await expect(resolveDuplicateReferralCore(admin, input)).resolves.toEqual({
      success: true,
      data: { referralId: 'lead-dup-1', outcome: 'kept_existing', alreadyResolved: false },
    });
    expect(mocks.insertedValues).toEqual([
      expect.objectContaining({
        id: duplicateResolutionId('tenant_ks', 'lead-dup-1'),
        tenantId: 'tenant_ks',
        actorId: 'u-admin',
        actorRole: 'tenant_admin',
        action: 'AGENT_LEAD_DUPLICATE_RESOLVED',
        entityType: 'lead_duplicate_referral',
        entityId: 'lead-dup-1',
        metadata: { outcome: 'kept_existing' },
      }),
    ]);
  });

  it('stores no free text: an extra note is not persisted', async () => {
    mocks.selects.push([{ submittingBranchId: 'b-1', leadBranchId: 'b-1' }]);
    mocks.inserts.push([{ id: 'x' }]);

    await resolveDuplicateReferralCore(admin, { ...input, note: 'Jane Doe, +383 44 000 000' });

    expect(JSON.stringify(mocks.insertedValues)).not.toContain('Jane');
  });

  it('answers a replay of the stored outcome as already resolved', async () => {
    mocks.selects.push([{ submittingBranchId: 'b-1', leadBranchId: 'b-1' }]);
    mocks.inserts.push([]);
    mocks.selects.push([{ metadata: { outcome: 'kept_existing' } }]);

    await expect(resolveDuplicateReferralCore(admin, input)).resolves.toMatchObject({
      success: true,
      data: { alreadyResolved: true },
    });
  });

  it('refuses a different outcome after another reviewer won', async () => {
    mocks.selects.push([{ submittingBranchId: 'b-1', leadBranchId: 'b-1' }]);
    mocks.inserts.push([]);
    mocks.selects.push([{ metadata: { outcome: 'dismissed' } }]);

    await expect(resolveDuplicateReferralCore(admin, input)).resolves.toMatchObject({
      success: false,
      code: 'ALREADY_RESOLVED',
    });
  });

  it('answers missing, cross-branch and moved-lead referrals alike as not found', async () => {
    for (const row of [
      undefined,
      { submittingBranchId: 'b-2', leadBranchId: 'b-1' },
      { submittingBranchId: 'b-1', leadBranchId: 'b-2' },
      { submittingBranchId: 'b-1', leadBranchId: null },
    ]) {
      mocks.selects.push(row ? [row] : []);
      await expect(resolveDuplicateReferralCore(manager, input)).resolves.toMatchObject({
        success: false,
        code: 'NOT_FOUND',
      });
    }
    expect(mocks.insertedValues).toHaveLength(0);
  });

  it('refuses staff and agents before any transaction', async () => {
    for (const userRole of ['staff', 'agent']) {
      await expect(
        resolveDuplicateReferralCore({ ...manager, userRole }, input)
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    expect(mocks.transactions).toBe(0);
  });

  it('gives a branchless manager not found and rejects an invalid payload without a transaction', async () => {
    await expect(
      resolveDuplicateReferralCore({ ...manager, scope: { branchId: null } }, input)
    ).resolves.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      resolveDuplicateReferralCore(admin, { referralId: 'lead-dup-1', outcome: 'merge' })
    ).resolves.toMatchObject({ code: 'INVALID_PAYLOAD' });
    expect(mocks.transactions).toBe(0);
  });

  it('derives a stable, tenant-bound resolution id', () => {
    const id = duplicateResolutionId('tenant_ks', 'lead-dup-1');
    expect(id).toMatch(/^lead-dup-res-[0-9a-f]{40}$/);
    expect(duplicateResolutionId('tenant_ks', 'lead-dup-1')).toBe(id);
    expect(duplicateResolutionId('tenant_mk', 'lead-dup-1')).not.toBe(id);
  });
});
