import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyMock = vi.hoisted(() => vi.fn());
const tenantMock = vi.hoisted(() => vi.fn());
vi.mock('@interdomestik/database/tenant', () => ({ withTenantContext: tenantMock }));
vi.mock('@interdomestik/domain-crm/routing', async importActual => {
  const actual = await importActual<typeof import('@interdomestik/domain-crm/routing')>();
  return { ...actual, applyCrmLeadRoutingDecision: applyMock };
});
import { createApplyCrmLeadRoutingDecisionCoordinator } from './routing-application-service';
const actor = {
  actorId: 'manager-1',
  role: 'branch_manager' as const,
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};
describe('routing coordinator preflight before database access', () => {
  beforeEach(() => {
    applyMock.mockReset();
    tenantMock.mockReset();
  });
  it.each([
    [{ ...actor, tenantId: '' }, 'valid', 'tenant_scope'],
    [{ ...actor, tenantId: '  ' }, 'valid', 'tenant_scope'],
    [{ ...actor, role: 'member' }, 'valid', 'role_scope'],
    [{ ...actor, scope: { branchId: null } }, 'valid', 'branch_scope'],
    [actor, '  ', 'invalid_override'],
  ])('rejects invalid input before tenant transaction', async (inputActor, key, reason) => {
    const createOutboxPort = vi.fn();
    const apply = createApplyCrmLeadRoutingDecisionCoordinator({ createOutboxPort });
    await expect(
      apply({
        actor: inputActor as typeof actor,
        idempotencyKey: key as string,
        leadId: 'lead-1',
        now: '2026-05-16T10:00:00.000Z',
      })
    ).resolves.toEqual({ outcome: 'rejected', reason });
    expect(tenantMock).not.toHaveBeenCalled();
    expect(createOutboxPort).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });
  it('maps unexpected adapter failures to repository_failure', async () => {
    tenantMock.mockImplementation((_context, callback) => callback({}));
    applyMock.mockRejectedValueOnce(new Error('db unavailable'));

    const apply = createApplyCrmLeadRoutingDecisionCoordinator({
      createOutboxPort: () => ({ appendEvent: vi.fn() }),
    });

    await expect(
      apply({
        actor,
        idempotencyKey: 'route:lead-1',
        leadId: 'lead-1',
        now: '2026-05-16T10:00:00.000Z',
      })
    ).resolves.toEqual({ outcome: 'repository_failure' });
  });
});
