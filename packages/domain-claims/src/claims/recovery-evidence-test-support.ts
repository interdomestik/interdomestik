import type { ClaimStatus } from '@interdomestik/database/constants';
import { vi, type Mock } from 'vitest';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import type { ClaimsSession } from './types';

export function createStaffSessionFixture(options: {
  userId: string;
  branchId?: string | null;
  role?: string;
  tenantId?: string;
}): ClaimsSession {
  return {
    user: {
      id: options.userId,
      role: options.role ?? 'staff',
      tenantId: options.tenantId ?? 'tenant-1',
      ...(options.branchId === undefined ? {} : { branchId: options.branchId }),
    },
  };
}

type DecisionSelect = { from: Mock; where: Mock; limit: Mock; for: Mock };
type RecoveryDecisionMocks<Columns> = {
  claimSelectChain: DecisionSelect;
  agreementSelectChain: DecisionSelect;
  txInsert: Mock;
  txInsertValues: Mock;
  txSelect: Mock;
  txUpdate: Mock;
  txUpdateSet: Mock;
  withTenantContext: Mock;
  appendEvent: Mock;
  claimEscalationAgreements: Columns;
  enqueue: Mock;
  recipient: Mock;
};

export function mockRecoveryDecisionTransaction<Columns extends Record<string, string>>(
  claimEscalationAgreements: Columns,
  query?: {
    claims: { findFirst: Mock };
    user: { findFirst: Mock };
  }
): RecoveryDecisionMocks<Columns> {
  const selectChain = () => ({ from: vi.fn(), where: vi.fn(), limit: vi.fn(), for: vi.fn() });
  const claimSelectChain = selectChain();
  const agreementSelectChain = selectChain();
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txSelect = vi.fn();
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const tx = { insert: txInsert, select: txSelect, update: txUpdate, ...(query && { query }) };
  const withTenantContext = vi.fn(
    async (_context: unknown, run: (value: typeof tx) => Promise<unknown>) => await run(tx)
  );
  const enqueue = vi.fn().mockResolvedValue(['decision-delivery']);
  const recipient = vi.fn().mockResolvedValue({ id: 'member-1' });
  const appendEvent = vi.fn().mockResolvedValue({ id: 'event-1' });
  const and = vi.fn((...conditions) => ({ op: 'and', conditions }));
  const eq = vi.fn((left, right) => ({ op: 'eq', left, right }));
  const claims = { id: 'claims.id', tenantId: 'claims.tenant_id' };
  const withTenant = vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition }));

  vi.doMock('@interdomestik/database', () => ({
    and,
    appendEvent,
    claimEscalationAgreements,
    claims,
    eq,
    withTenantContext,
  }));
  vi.doMock('@interdomestik/domain-communications/notification-deliveries', () => ({
    enqueueRecoveryDecisionNotification: enqueue,
    lockClaimNotificationRecipient: recipient,
  }));
  vi.doMock('@interdomestik/database/tenant-security', () => ({ withTenant }));

  return {
    claimSelectChain,
    agreementSelectChain,
    txInsert,
    txInsertValues,
    txSelect,
    txUpdate,
    txUpdateSet,
    withTenantContext,
    appendEvent,
    claimEscalationAgreements,
    enqueue,
    recipient,
  };
}

export function authorizedRecoveryReadRow(params: {
  claimId?: string;
  caseLifecycleState?: string | null;
  lifecycleVersion: number;
  recoveryLifecycleState?: string | null;
  status: ClaimStatus | null;
}) {
  const lifecycleStates: Partial<ReturnType<typeof mapClaimStatusToLifecycleStates>> = params.status
    ? mapClaimStatusToLifecycleStates(params.status)
    : {};

  return {
    caseLifecycleState: params.caseLifecycleState ?? lifecycleStates.caseLifecycleState ?? null,
    claimId: params.claimId ?? 'claim-1',
    acceptedAt: new Date('2026-03-12T09:00:00Z'),
    legalActionCapPercentage: 25,
    lifecycleVersion: params.lifecycleVersion,
    paymentAuthorizationState: 'authorized',
    recoveryLifecycleState:
      params.recoveryLifecycleState ?? lifecycleStates.recoveryLifecycleState ?? null,
    signedAt: new Date('2026-03-12T09:00:00Z'),
    status: params.status,
  };
}
