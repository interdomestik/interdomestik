import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({
    where: txUpdateWhere,
  }));
  const txUpdate = vi.fn(() => ({
    set: txUpdateSet,
  }));
  const selectWhere = vi.fn();
  const selectFrom = vi.fn(() => ({
    where: selectWhere,
  }));
  const select = vi.fn(() => ({
    from: selectFrom,
  }));

  return {
    db: {
      select,
    },
    selectWhere,
    txUpdate,
    txUpdateSet,
    txUpdateWhere,
    withTenantContext: vi.fn(
      async (_context: unknown, callback: (tx: { update: typeof txUpdate }) => Promise<unknown>) =>
        callback({
          update: txUpdate,
        })
    ),
  };
});

vi.mock('@/lib/db.server', () => ({
  db: mocks.db,
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {
    __name: 'ai_runs',
    entityType: { __name: 'ai_runs.entity_type' },
    id: { __name: 'ai_runs.id' },
    status: { __name: 'ai_runs.status' },
    tenantId: { __name: 'ai_runs.tenant_id' },
    workflow: { __name: 'ai_runs.workflow' },
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ __op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ __op: 'eq', left, right })),
}));

import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

import { markAiRunDispatchFailedWithTenantContext } from './dispatch-failure';

const authority = mintTestTenantAuthority('tenant_mk');

describe('markAiRunDispatchFailedWithTenantContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      errorCode: 'policy_extract_dispatch_failed',
      entityType: 'policy',
      workflow: 'policy_extract',
    },
    {
      errorCode: 'claim_ai_dispatch_failed',
      entityType: 'claim',
      workflow: undefined,
    },
  ])('updates queued $entityType AI runs inside the given tenant context', async args => {
    await markAiRunDispatchFailedWithTenantContext({
      ...args,
      authority,
      runId: 'run-1',
      message: 'Inngest dispatch failed.',
    });

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
    expect(mocks.txUpdate).toHaveBeenCalledWith(expect.objectContaining({ __name: 'ai_runs' }));
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: args.errorCode,
        errorMessage: 'Inngest dispatch failed.',
      })
    );
  });

  it('binds the update predicate to the tenant, run, entity type and queued status', async () => {
    await markAiRunDispatchFailedWithTenantContext({
      authority,
      entityType: 'policy',
      errorCode: 'policy_extract_dispatch_failed',
      message: 'Inngest dispatch failed.',
      runId: 'run-1',
      workflow: 'policy_extract',
    });

    expect(mocks.txUpdateWhere).toHaveBeenCalledTimes(1);
    const predicate = mocks.txUpdateWhere.mock.calls[0]?.[0] as { __op: string; args: unknown[] };
    expect(predicate.__op).toBe('and');
    expect(predicate.args).toEqual(
      expect.arrayContaining([
        { __op: 'eq', left: { __name: 'ai_runs.tenant_id' }, right: 'tenant_mk' },
        { __op: 'eq', left: { __name: 'ai_runs.id' }, right: 'run-1' },
        { __op: 'eq', left: { __name: 'ai_runs.entity_type' }, right: 'policy' },
        { __op: 'eq', left: { __name: 'ai_runs.workflow' }, right: 'policy_extract' },
        { __op: 'eq', left: { __name: 'ai_runs.status' }, right: 'queued' },
      ])
    );
  });

  it('performs no read before the update and never uses the ambient database', async () => {
    await markAiRunDispatchFailedWithTenantContext({
      authority,
      entityType: 'claim',
      errorCode: 'claim_ai_dispatch_failed',
      message: 'Inngest dispatch failed.',
      runId: 'run-1',
    });

    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.selectWhere).not.toHaveBeenCalled();
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
  });
});
