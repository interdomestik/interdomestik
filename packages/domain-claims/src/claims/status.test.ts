import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  userFindFirst: vi.fn(),
  getPaymentAuthorizationState: vi.fn(),
  transitionClaimStatus: vi.fn(),
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: { findFirst: mocks.findFirst },
      user: { findFirst: mocks.userFindFirst },
    },
  },
  relayClaimStatusAuditProjectionEvents: vi.fn(),
  claims: { id: 'claims.id', tenantId: 'claims.tenant_id' },
  user: { id: 'user.id', tenantId: 'user.tenant_id' },
  eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock('@interdomestik/database/tenant-security', () => ({ withTenant: mocks.withTenant }));
vi.mock('@interdomestik/shared-auth', () => ({ ensureTenantId: vi.fn(() => 'tenant-1') }));
vi.mock('../admin-claims/payment-authorization', () => ({
  getPaymentAuthorizationState: mocks.getPaymentAuthorizationState,
}));
vi.mock('./transition', () => ({ transitionClaimStatus: mocks.transitionClaimStatus }));

import { updateClaimStatusCore } from './status';

const requestHeaders = new Headers({ 'user-agent': 'Vitest' });
const staffSession = { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } } as never;
const persistedNegotiation = {
  success: true,
  fromStatus: 'draft',
  lifecycleVersion: 2,
  status: 'negotiation',
};
const claimScopeTable = { id: 'claims.id', tenantId: 'claims.tenant_id' };
const eqCondition = { eq: true };

function runClaimScope(query: { where: Function }) {
  query.where(claimScopeTable, { eq: vi.fn(() => eqCondition) });
}

function mockClaim(status: string) {
  mocks.findFirst.mockResolvedValueOnce({
    id: 'claim-1',
    status,
    userId: 'member-1',
    title: 'Test Claim',
    tenantId: 'tenant-1',
  });
}

function runStatusUpdate(deps = {}, newStatus = 'submitted') {
  const params = { session: staffSession, requestHeaders, claimId: 'claim-1', newStatus };
  return updateClaimStatusCore(params, deps);
}

function sideEffectDeps() {
  return {
    logAuditEvent: vi.fn(),
    notifyStatusChanged: vi.fn(),
    projectClaimStatusAuditProjection: vi.fn(),
    revalidatePath: vi.fn(),
  };
}

const projectionCall = { limit: 10, tenantId: 'tenant-1' };

describe('updateClaimStatusCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transitionClaimStatus.mockResolvedValue(persistedNegotiation);
  });

  it('rejects when claim is not found in tenant scope', async () => {
    mocks.findFirst.mockImplementationOnce(query => {
      runClaimScope(query);
      return null;
    });
    const result = await runStatusUpdate();

    expect(result).toEqual({ success: false, error: 'Claim not found', data: undefined });
    expect(mocks.withTenant).toHaveBeenCalledWith('tenant-1', 'claims.tenant_id', eqCondition);
  });

  it('preserves validation and authorization errors', async () => {
    expect(await runStatusUpdate({}, 'invalid-status')).toEqual({
      success: false,
      error: 'Invalid status',
      data: undefined,
    });
    expect(
      await updateClaimStatusCore({
        session: { user: { id: 'user-1', role: 'member', tenantId: 'tenant-1' } } as never,
        requestHeaders,
        claimId: 'claim-1',
        newStatus: 'submitted',
      })
    ).toEqual({ success: false, error: 'Unauthorized', data: undefined });
  });

  it('routes successful status changes through the transition command', async () => {
    const deps = sideEffectDeps();
    mockClaim('draft');
    mocks.userFindFirst.mockResolvedValueOnce({ email: 'member@example.com' });
    mocks.transitionClaimStatus.mockResolvedValueOnce(persistedNegotiation);

    const result = await runStatusUpdate(deps, 'negotiation');

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.transitionClaimStatus.mock.calls[0]?.[0]).toMatchObject({
      actor: { id: 'staff-1' },
      toStatus: 'negotiation',
    });
    expect(deps.logAuditEvent).not.toHaveBeenCalled();
    expect(deps.projectClaimStatusAuditProjection).toHaveBeenCalledWith(projectionCall);
    expect(deps.notifyStatusChanged).toHaveBeenCalledWith(
      'member-1',
      'member@example.com',
      { id: 'claim-1', title: 'Test Claim' },
      'draft',
      'negotiation'
    );
    expect(deps.revalidatePath).toHaveBeenCalledWith('/admin/claims');
  });

  it('surfaces transition rejection without audit or notification side effects', async () => {
    const deps = sideEffectDeps();
    mockClaim('evaluation');
    mocks.transitionClaimStatus.mockResolvedValueOnce({
      success: false,
      error: 'transition_rejected',
    });

    const result = await runStatusUpdate(deps);

    expect(result).toEqual({ success: false, error: 'Invalid status transition', data: undefined });
    expect(deps.logAuditEvent).not.toHaveBeenCalled();
    expect(deps.notifyStatusChanged).not.toHaveBeenCalled();
    expect(deps.revalidatePath).not.toHaveBeenCalled();
  });
});
