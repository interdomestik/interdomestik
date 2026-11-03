import type { Mock } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import type { ClaimsSession } from '../claims/types';

export type MockClaimRecord = {
  category: string;
  id: string;
  userId: string;
};
const mocks: {
  appendEvent: Mock;
  db: { transaction: Mock };
  logAuditEvent: Mock;
  claims: {
    id: string;
    tenantId: string;
    branchId: string;
    category: string;
    staffId: string;
    userId: string;
  };
  claimEscalationAgreements: {
    id: string;
    tenantId: string;
    claimId: string;
    decisionNextStatus: string;
    decisionReason: string;
    feePercentage: string;
    minimumFee: string;
    legalActionCapPercentage: string;
    paymentAuthorizationState: string;
    termsVersion: string;
    signedAt: string;
    acceptedAt: string;
    acceptedById: string;
    signedByUserId: string;
    updatedAt: string;
  };
  eq: Mock;
  and: Mock;
  withTenant: Mock;
  ensureTenantId: Mock;
  claimSelectChain: { from: Mock; where: Mock; limit: Mock };
  agreementSelectChain: { from: Mock; where: Mock; limit: Mock };
  txInsert: Mock;
  txInsertValues: Mock;
  txSelect: Mock;
  txUpdate: Mock;
  txUpdateSet: Mock;
  txUpdateWhere: Mock;
} = vi.hoisted(() => {
  const claimSelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const agreementSelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txSelect = vi.fn();
  const transaction = vi.fn(
    async cb =>
      await cb({
        insert: txInsert,
        select: txSelect,
        update: txUpdate,
      })
  );

  return {
    appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    db: { transaction },
    logAuditEvent: vi.fn(),
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      category: 'claims.category',
      staffId: 'claims.staff_id',
      userId: 'claims.user_id',
    },
    claimEscalationAgreements: {
      id: 'claim_escalation_agreements.id',
      tenantId: 'claim_escalation_agreements.tenant_id',
      claimId: 'claim_escalation_agreements.claim_id',
      decisionNextStatus: 'claim_escalation_agreements.decision_next_status',
      decisionReason: 'claim_escalation_agreements.decision_reason',
      feePercentage: 'claim_escalation_agreements.fee_percentage',
      minimumFee: 'claim_escalation_agreements.minimum_fee',
      legalActionCapPercentage: 'claim_escalation_agreements.legal_action_cap_percentage',
      paymentAuthorizationState: 'claim_escalation_agreements.payment_authorization_state',
      termsVersion: 'claim_escalation_agreements.terms_version',
      signedAt: 'claim_escalation_agreements.signed_at',
      acceptedAt: 'claim_escalation_agreements.accepted_at',
      acceptedById: 'claim_escalation_agreements.accepted_by_id',
      signedByUserId: 'claim_escalation_agreements.signed_by_user_id',
      updatedAt: 'claim_escalation_agreements.updated_at',
    },
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    claimSelectChain,
    agreementSelectChain,
    txInsert,
    txInsertValues,
    txSelect,
    txUpdate,
    txUpdateSet,
    txUpdateWhere,
  };
});
vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  appendEvent: mocks.appendEvent,
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claims: mocks.claims,
  db: mocks.db,
  withTenantContext: vi.fn(
    async (_ctx: unknown, cb: (tx: any) => unknown) => await mocks.db.transaction(cb)
  ),
  eq: mocks.eq,
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));
vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));
function createSession(options: {
  userId: string;
  branchId?: string | null;
  role?: string;
  tenantId?: string;
}): ClaimsSession {
  const user = {
    id: options.userId,
    role: options.role ?? 'staff',
    tenantId: options.tenantId ?? 'tenant-1',
  };

  if (options.branchId === undefined) {
    return { user } as unknown as ClaimsSession;
  }

  return {
    user: { ...user, branchId: options.branchId },
  } as unknown as ClaimsSession;
}
function mockAgreementSaveSelects(options?: {
  agreements?: Array<Record<string, unknown>>;
  claim?: Partial<MockClaimRecord>;
}) {
  mocks.txSelect
    .mockReturnValueOnce(mocks.claimSelectChain)
    .mockReturnValueOnce(mocks.agreementSelectChain);
  mocks.claimSelectChain.limit.mockResolvedValue([
    {
      category: 'vehicle',
      id: 'claim-1',
      userId: 'member-1',
      ...options?.claim,
    },
  ]);
  mocks.agreementSelectChain.limit.mockResolvedValue(options?.agreements ?? []);
}
const authority: TenantAuthority = mintTestTenantAuthority('tenant-1');

export { mocks, createSession, mockAgreementSaveSelects, authority };
