import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  factory: vi.fn(),
  read: vi.fn(),
  run: vi.fn(),
  tenant: vi.fn(),
  tx: {},
  repository: {},
}));
vi.mock('@interdomestik/database', () => ({ withTenantContext: h.tenant }));
vi.mock('@/adapters/crm/routing-repository', () => ({
  createAdminCrmRoutingRuleRepository: h.factory,
}));
vi.mock('./_routing-core', async importOriginal => ({
  ...(await importOriginal<typeof import('./_routing-core')>()),
  getAdminCrmRoutingRulesCore: h.read,
  runAdminCrmRoutingRuleAction: h.run,
}));

import { getAdminCrmRoutingRulesCore, runAdminCrmRoutingRuleAction } from './_routing-tenant';

const actor = { actorId: 'admin-1', role: 'admin' as const, scope: {}, tenantId: 'tenant-1' };
const args = {
  input: {},
  kind: 'create' as const,
  session: { user: { id: actor.actorId, role: actor.role, tenantId: actor.tenantId } },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.factory.mockReturnValue(h.repository);
  h.tenant.mockImplementation(async (_context, action) => action(h.tx));
  h.run.mockResolvedValue({ status: 'ok' });
  h.read.mockResolvedValue({ rules: [], counts: { active: 0, archived: 0 } });
});

describe('CRM routing tenant boundary', () => {
  it('binds rule validation and mutation to the authorized tenant transaction', async () => {
    await expect(runAdminCrmRoutingRuleAction(args)).resolves.toEqual({ status: 'ok' });
    expect(h.tenant).toHaveBeenCalledWith({ tenantId: actor.tenantId }, expect.any(Function));
    expect(h.factory).toHaveBeenCalledWith(h.tx);
    expect(h.run).toHaveBeenCalledWith(args, { repository: h.repository });
  });

  it('binds listing to the same transaction repository', async () => {
    await getAdminCrmRoutingRulesCore({ actor });
    expect(h.tenant).toHaveBeenCalledWith({ tenantId: actor.tenantId }, expect.any(Function));
    expect(h.factory).toHaveBeenCalledWith(h.tx);
    expect(h.read).toHaveBeenCalledWith({ actor }, { repository: h.repository });
  });

  it('rejects unauthorized mutations before opening a transaction', async () => {
    await expect(runAdminCrmRoutingRuleAction({ ...args, session: null })).resolves.toEqual({
      reason: 'forbidden',
      status: 'error',
    });
    expect(h.tenant).not.toHaveBeenCalled();
    expect(h.factory).not.toHaveBeenCalled();
  });

  it('rejects unauthorized reads before opening a transaction', async () => {
    await expect(
      getAdminCrmRoutingRulesCore({
        actor: { ...actor, role: 'branch_manager' },
      })
    ).rejects.toThrow('Admin CRM routing access denied');
    expect(h.tenant).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'error', reason: 'repository_failure' },
    { status: 'error', reason: 'cross_tenant_agent', field: 'agentIds' },
  ])('rolls back returned errors without losing their structured reason: $reason', async result => {
    let committedWrites = 0;
    let pendingWrites = 0;
    let rolledBack = false;
    h.run.mockImplementation(async () => {
      pendingWrites++;
      return result;
    });
    h.tenant.mockImplementation(async (_context, action) => {
      try {
        const value = await action(h.tx);
        committedWrites += pendingWrites;
        return value;
      } catch (error) {
        rolledBack = true;
        throw error;
      } finally {
        pendingWrites = 0;
      }
    });
    await expect(runAdminCrmRoutingRuleAction(args)).resolves.toEqual(result);
    expect(rolledBack).toBe(true);
    expect(committedWrites).toBe(0);
  });

  it('fails closed if the transaction cannot be established', async () => {
    h.tenant.mockRejectedValueOnce(new Error('Unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(runAdminCrmRoutingRuleAction(args)).resolves.toEqual({
        reason: 'repository_failure',
        status: 'error',
      });
      expect(h.factory).not.toHaveBeenCalled();
      expect(h.run).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
