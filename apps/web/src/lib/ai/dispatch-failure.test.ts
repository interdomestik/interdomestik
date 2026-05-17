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
      async (
        _context: { tenantId: string; role?: string },
        callback: (tx: { update: typeof txUpdate }) => Promise<unknown>
      ) =>
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

import { markAiRunDispatchFailedWithTenantContext } from './dispatch-failure';

describe('markAiRunDispatchFailedWithTenantContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectWhere.mockResolvedValue([{ tenantId: 'tenant-1' }]);
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
  ])('updates queued $entityType AI runs inside tenant context', async args => {
    await markAiRunDispatchFailedWithTenantContext({
      ...args,
      runId: 'run-1',
      message: 'Inngest dispatch failed.',
    });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'system' },
      expect.any(Function)
    );
    expect(mocks.txUpdate).toHaveBeenCalledWith(expect.objectContaining({ __name: 'ai_runs' }));
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: args.errorCode,
        errorMessage: 'Inngest dispatch failed.',
      })
    );
  });

  it('does not write when the queued AI run is gone', async () => {
    mocks.selectWhere.mockResolvedValue([]);

    await markAiRunDispatchFailedWithTenantContext({
      entityType: 'policy',
      errorCode: 'policy_extract_dispatch_failed',
      message: 'Inngest dispatch failed.',
      runId: 'run-1',
      workflow: 'policy_extract',
    });

    expect(mocks.withTenantContext).not.toHaveBeenCalled();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });
});
