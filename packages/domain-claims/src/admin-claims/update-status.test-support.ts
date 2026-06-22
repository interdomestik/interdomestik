import { vi } from 'vitest';

type MockFunction = ReturnType<typeof vi.fn>;

type UpdateStatusMocks = {
  agreementFrom: MockFunction;
  agreementLimit: MockFunction;
  agreementWhere: MockFunction;
  claimFrom: MockFunction;
  claimLeftJoin: MockFunction;
  claimWhere: MockFunction;
  dbSelect: MockFunction;
  dbUpdate: MockFunction;
  transitionClaimStatus: MockFunction;
  updateSet: MockFunction;
  updateWhere: MockFunction;
  withTenant: MockFunction;
};

const updateStatusMocks: UpdateStatusMocks = vi.hoisted(() => ({
  agreementFrom: vi.fn(),
  agreementLimit: vi.fn(),
  agreementWhere: vi.fn(),
  claimFrom: vi.fn(),
  claimLeftJoin: vi.fn(),
  claimWhere: vi.fn(),
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  transitionClaimStatus: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  withTenant: vi.fn((tenantId, tenantColumn, condition) => ({ tenantId, tenantColumn, condition })),
}));

updateStatusMocks.claimLeftJoin.mockReturnValue({ where: updateStatusMocks.claimWhere });
updateStatusMocks.claimFrom.mockReturnValue({ leftJoin: updateStatusMocks.claimLeftJoin });
updateStatusMocks.agreementWhere.mockReturnValue({ limit: updateStatusMocks.agreementLimit });
updateStatusMocks.agreementFrom.mockReturnValue({ where: updateStatusMocks.agreementWhere });
updateStatusMocks.updateSet.mockReturnValue({ where: updateStatusMocks.updateWhere });
updateStatusMocks.dbUpdate.mockReturnValue({ set: updateStatusMocks.updateSet });
updateStatusMocks.dbSelect.mockImplementation((fields: { paymentAuthorizationState?: unknown }) =>
  fields.paymentAuthorizationState
    ? { from: updateStatusMocks.agreementFrom }
    : { from: updateStatusMocks.claimFrom }
);

vi.mock('@interdomestik/database', () => ({
  db: {
    select: updateStatusMocks.dbSelect,
    update: updateStatusMocks.dbUpdate,
  },
  relayClaimStatusAuditProjectionEvents: vi.fn(),
  claimEscalationAgreements: {
    claimId: 'claim_escalation_agreements.claim_id',
    paymentAuthorizationState: 'claim_escalation_agreements.payment_authorization_state',
    tenantId: 'claim_escalation_agreements.tenant_id',
  },
  claims: {
    caseLifecycleState: 'claims.case_lifecycle_state',
    id: 'claims.id',
    recoveryLifecycleState: 'claims.recovery_lifecycle_state',
    status: 'claims.status',
    tenantId: 'claims.tenant_id',
    userId: 'claims.user_id',
  },
  user: { id: 'user.id', email: 'user.email' },
  eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: updateStatusMocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('../claims/transition', () => ({
  transitionClaimStatus: updateStatusMocks.transitionClaimStatus,
}));

export const adminSession = {
  user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant-1' },
} as never;

export const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

export function mockClaim(status: string, compatStatus = status): void {
  const states =
    status === 'resolved'
      ? { caseLifecycleState: 'resolved', recoveryLifecycleState: 'resolved' }
      : status === 'submitted'
        ? { caseLifecycleState: 'submitted', recoveryLifecycleState: 'not_started' }
        : status === 'evaluation'
          ? { caseLifecycleState: 'evaluation', recoveryLifecycleState: 'not_started' }
          : {};
  updateStatusMocks.claimWhere.mockResolvedValueOnce([
    {
      ...states,
      id: 'claim-1',
      title: 'Claim',
      status: compatStatus,
      userId: 'member-1',
      userEmail: 'member@example.com',
    },
  ]);
}

export function getUpdateStatusMocks(): UpdateStatusMocks {
  return updateStatusMocks;
}
