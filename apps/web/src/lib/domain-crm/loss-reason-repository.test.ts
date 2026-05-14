import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  db: {},
}));

vi.mock('@interdomestik/database/db', () => ({
  db: hoisted.db,
}));

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import { createCrmLossReasonRepository } from './loss-reason-repository';

const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

describe('crmLossReasonRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves active tenant and branch-compatible loss reasons', async () => {
    const findFirst = vi.fn(async () => ({ code: 'price', id: 'reason-1' }));
    const repository = createCrmLossReasonRepository({
      query: {
        crmLossReasons: { findFirst },
      },
    } as never);

    await expect(
      repository.resolveLossReason({ actor, lossReasonId: 'reason-1' })
    ).resolves.toEqual({ code: 'price', id: 'reason-1' });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { code: true, id: true },
        where: expect.anything(),
      })
    );
  });

  it('returns null when no active scoped loss reason exists', async () => {
    const repository = createCrmLossReasonRepository({
      query: {
        crmLossReasons: { findFirst: vi.fn(async () => null) },
      },
    } as never);

    await expect(
      repository.resolveLossReason({ actor, lossReasonId: 'missing-reason' })
    ).resolves.toBeNull();
  });
});
