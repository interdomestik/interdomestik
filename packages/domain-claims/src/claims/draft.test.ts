import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  findFirst: vi.fn(),
  returning: vi.fn(),
  transitionClaimStatus: vi.fn(),
  withTenant: vi.fn(() => ({ scoped: true })),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => {
  const db = {
    insert: mocks.dbInsert,
    query: { claims: { findFirst: mocks.findFirst } },
    update: mocks.dbUpdate,
  };
  return {
    and: vi.fn((...conditions: unknown[]) => conditions),
    claimDocuments: {},
    claims: {
      caseLifecycleState: 'claims.case_lifecycle_state',
      recoveryLifecycleState: 'claims.recovery_lifecycle_state',
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      userId: 'claims.user_id',
    },
    db,
    eq: vi.fn((left, right) => ({ left, right })),
    withTenantContext: mocks.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: unknown) => unknown) => callback(db)
    ),
  };
});

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('./transition', () => ({
  transitionClaimStatus: mocks.transitionClaimStatus,
}));

import { cancelClaimCore, updateDraftClaimCore } from './draft';

const authority = mintTestTenantAuthority('tenant-1');
const requestHeaders = new Headers({ 'user-agent': 'Vitest' });
const memberSession = { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } } as never;

function lifecycleStatesForStatus(status: string) {
  if (status === 'resolved') {
    return { caseLifecycleState: 'resolved', recoveryLifecycleState: 'resolved' };
  }
  if (status === 'submitted') {
    return { caseLifecycleState: 'submitted', recoveryLifecycleState: 'not_started' };
  }
  return { caseLifecycleState: 'draft', recoveryLifecycleState: 'not_started' };
}

function mockClaim(status = 'draft', category = 'vehicle') {
  mocks.findFirst.mockResolvedValueOnce({
    ...lifecycleStatesForStatus(status),
    category,
    id: 'claim-1',
    tenantId: 'tenant-1',
    title: 'Claim',
    userId: 'member-1',
  });
}

function runUpdate(category: string, deps = sideEffectDeps()) {
  return updateDraftClaimCore(
    {
      authority,
      claimId: 'claim-1',
      data: {
        category,
        companyName: 'Auto Insurer',
        currency: 'EUR',
        description: 'The vehicle was damaged in the parking lot.',
        // Attachment verification and object locks are covered by the draft-attachment tests.
        files: [],
        title: 'Vehicle repair claim',
      },
      requestHeaders,
      session: memberSession,
    },
    deps
  );
}

function runCancel(deps = {}) {
  return cancelClaimCore(
    { authority, claimId: 'claim-1', requestHeaders, session: memberSession },
    deps
  );
}

function sideEffectDeps() {
  return {
    logAuditEvent: vi.fn(),
    revalidatePath: vi.fn(),
  };
}

describe('cancelClaimCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transitionClaimStatus.mockResolvedValue({
      success: true,
      fromStatus: 'draft',
      lifecycleVersion: 2,
      status: 'rejected',
    });
  });

  it('routes successful cancellation through the transition command', async () => {
    const deps = sideEffectDeps();
    mockClaim();

    const result = await runCancel(deps);

    expect(result).toEqual({ success: true });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(mocks.transitionClaimStatus).toHaveBeenCalledWith({
      actor: { id: 'member-1', role: 'member' },
      authority,
      claimId: 'claim-1',
      toStatus: 'rejected',
    });
    expect(deps.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.cancelled',
        actorId: 'member-1',
        entityId: 'claim-1',
        headers: requestHeaders,
        metadata: { oldStatus: 'draft', newStatus: 'rejected' },
        authority,
      })
    );
    expect(deps.revalidatePath).toHaveBeenCalledWith('/member/claims');
    expect(deps.revalidatePath).toHaveBeenCalledWith('/member/claims/claim-1');
  });

  it('surfaces transition rejection without audit or revalidation side effects', async () => {
    const deps = sideEffectDeps();
    mockClaim('submitted');
    mocks.transitionClaimStatus.mockResolvedValueOnce({
      success: false,
      error: 'transition_rejected',
    });

    const result = await runCancel(deps);

    expect(result).toEqual({ success: false, error: 'Invalid status transition' });
    expect(mocks.transitionClaimStatus).toHaveBeenCalledWith({
      actor: { id: 'member-1', role: 'member' },
      authority,
      claimId: 'claim-1',
      toStatus: 'rejected',
    });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(deps.logAuditEvent).not.toHaveBeenCalled();
    expect(deps.revalidatePath).not.toHaveBeenCalled();
  });

  it('preserves terminal-status cancellation rejection before transition', async () => {
    mockClaim('resolved');

    const result = await runCancel(sideEffectDeps());

    expect(result).toEqual({ success: false, error: 'Claim cannot be cancelled' });
    expect(mocks.transitionClaimStatus).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
});

describe('updateDraftClaimCore', () => {
  const where = vi.fn(() => ({ returning: mocks.returning }));
  const set = vi.fn(() => ({ where }));
  const values = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbUpdate.mockReturnValue({ set });
    mocks.dbInsert.mockReturnValue({ values });
    mockClaim('draft', 'Personal Injury');
  });

  it.each(['injury', 'invalidity', 'Personal Injury'])(
    'refuses to edit a draft to category %s',
    async category => {
      await expect(runUpdate(category)).resolves.toEqual({
        success: false,
        error: 'Validation failed',
      });
      expect(mocks.dbUpdate).not.toHaveBeenCalled();
      expect(mocks.dbInsert).not.toHaveBeenCalled();
    }
  );

  it('corrects a legacy category while the claim belongs to the member and is still a draft', async () => {
    mocks.returning.mockResolvedValueOnce([{ id: 'claim-1' }]);

    await expect(runUpdate(' VEHICLE ')).resolves.toEqual({ success: true });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ category: 'vehicle' }));
    expect(mocks.withTenant).toHaveBeenCalledWith('tenant-1', 'claims.tenant_id', [
      { left: 'claims.id', right: 'claim-1' },
      { left: 'claims.user_id', right: 'member-1' },
      { left: 'claims.case_lifecycle_state', right: 'draft' },
      { left: 'claims.recovery_lifecycle_state', right: 'not_started' },
    ]);
  });

  it('refuses a stale draft edit before attaching documents or recording success', async () => {
    mocks.returning.mockResolvedValueOnce([]);
    const deps = sideEffectDeps();

    await expect(runUpdate('vehicle', deps)).resolves.toEqual({
      success: false,
      error: 'Claim changed. Refresh and retry.',
      code: 'CONFLICT',
    });

    expect(mocks.dbInsert).not.toHaveBeenCalled();
    expect(deps.logAuditEvent).not.toHaveBeenCalled();
    expect(deps.revalidatePath).not.toHaveBeenCalled();
  });
});
