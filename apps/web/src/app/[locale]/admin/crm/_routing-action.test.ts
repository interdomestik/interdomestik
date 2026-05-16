import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionSafe: vi.fn(),
  resolveAdminCrmRoutingActor: vi.fn(),
  revalidatePath: vi.fn(),
  runAdminCrmRoutingRuleAction: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafe,
}));

vi.mock('./_routing-core', () => ({
  resolveAdminCrmRoutingActor: hoisted.resolveAdminCrmRoutingActor,
  runAdminCrmRoutingRuleAction: hoisted.runAdminCrmRoutingRuleAction,
}));

import {
  createRoutingRuleAction,
  updateRoutingRuleAction,
  type AdminCrmRoutingActionState,
} from './_routing-action';

const idleState: AdminCrmRoutingActionState = { status: 'idle' };
const adminSession = {
  user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
};
const adminActor = {
  actorId: 'admin-1',
  role: 'admin',
  scope: { branchId: null },
  tenantId: 'tenant-1',
};

describe('admin CRM routing server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionSafe.mockResolvedValue(adminSession);
    hoisted.resolveAdminCrmRoutingActor.mockReturnValue(adminActor);
    hoisted.runAdminCrmRoutingRuleAction.mockResolvedValue({ ruleId: 'rule-1', status: 'ok' });
  });

  it('authorizes before reading FormData for forbidden sessions', async () => {
    const formData = {
      get: vi.fn(() => {
        throw new Error('FormData should not be parsed before authorization');
      }),
    } as unknown as FormData;
    hoisted.getSessionSafe.mockResolvedValue({
      user: { id: 'manager-1', role: 'branch_manager', tenantId: 'tenant-1' },
    });
    hoisted.resolveAdminCrmRoutingActor.mockReturnValue(null);

    await expect(createRoutingRuleAction(idleState, formData)).resolves.toEqual({
      reason: 'forbidden',
      status: 'error',
    });

    expect(formData.get).not.toHaveBeenCalled();
    expect(hoisted.runAdminCrmRoutingRuleAction).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it('normalizes create FormData only after authorization and revalidates on success', async () => {
    const formData = new FormData();
    formData.set('agentIds', 'agent-1, agent-2');
    formData.set('priority', '3');
    formData.set('source', ' website ');
    formData.set('strategy', 'round_robin');

    await expect(createRoutingRuleAction(idleState, formData)).resolves.toEqual({
      ruleId: 'rule-1',
      status: 'ok',
    });

    expect(hoisted.runAdminCrmRoutingRuleAction).toHaveBeenCalledWith({
      input: expect.objectContaining({
        agentIds: ['agent-1', 'agent-2'],
        enabled: true,
        priority: 3,
        source: 'website',
        strategy: 'round_robin',
      }),
      kind: 'create',
      session: adminSession,
    });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/en/admin/crm');
  });

  it('omits blank agent IDs, enabled, and priority on update so the core can preserve existing values', async () => {
    const formData = new FormData();
    formData.set('expectedUpdatedAt', '2026-05-16T08:00:00.000Z');
    formData.set('ruleId', 'rule-1');
    formData.set('strategy', 'manual_only');

    await expect(updateRoutingRuleAction(idleState, formData)).resolves.toEqual({
      ruleId: 'rule-1',
      status: 'ok',
    });

    const call = hoisted.runAdminCrmRoutingRuleAction.mock.calls[0]?.[0] as
      | { input: Record<string, unknown>; kind: string; session: typeof adminSession }
      | undefined;
    expect(call).toEqual({ input: expect.any(Object), kind: 'update', session: adminSession });
    expect(call?.input).not.toHaveProperty('agentIds');
    expect(call?.input).not.toHaveProperty('enabled');
    expect(call?.input).not.toHaveProperty('priority');
  });
});
