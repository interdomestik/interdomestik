import { vi } from 'vitest';
import { createClaimActionTxSelect } from './claims.test-helpers';

export type MockResolvedOnce = {
  mockResolvedValueOnce: (value: unknown) => unknown;
};

export const mockGetSession = vi.fn();
export const mockDbInsert = vi.fn().mockReturnValue({
  onConflictDoUpdate: vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ lastNumber: 1 }]),
  }),
  returning: vi.fn().mockResolvedValue([{ id: 'claim-1' }]),
});
export const mockDbUpdate = vi.fn();
// prettier-ignore
export const submittedLifecycleCurrentClaim = { id: 'claim-1', lifecycleVersion: 1, caseLifecycleState: 'submitted', recoveryLifecycleState: 'not_started', status: 'submitted' };
export const mockTxSelectLimit = vi.fn().mockResolvedValue([submittedLifecycleCurrentClaim]);
export const mockTxUpdateReturning = vi
  .fn()
  .mockResolvedValue([{ id: 'claim-1', lifecycleVersion: 2 }]);
export const mockPaymentLimit = vi
  .fn()
  .mockResolvedValue([{ paymentAuthorizationState: 'authorized' }]);
export const mockEmptyConsentLimit = vi.fn().mockResolvedValue([]);
export const mockHasActiveMembership = vi.fn();
export const mockGetActiveSubscription = vi.fn();
export const mockValidateInitialClaimEvidenceUpload = vi.fn();

export function databaseModuleMock() {
  const moduleMock = {
    appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    db: {
      insert: () => ({ values: mockDbInsert }),
      select: () => ({ from: () => ({ where: () => ({ limit: mockPaymentLimit }) }) }),
      update: () => ({ set: () => ({ where: mockDbUpdate }) }),
      transaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
        fn({
          insert: () => ({ values: mockDbInsert }),
          select: createClaimActionTxSelect({
            emptyConsentLimit: mockEmptyConsentLimit,
            paymentLimit: mockTxSelectLimit,
          }),
          update: () => ({ set: () => ({ where: () => ({ returning: mockTxUpdateReturning }) }) }),
          query: {
            tenants: {
              findFirst: vi.fn().mockResolvedValue({ id: 'tenant_mk', countryCode: 'MK' }),
            },
            agentClients: { findFirst: vi.fn().mockResolvedValue(null) },
            tenantSettings: { findFirst: vi.fn().mockResolvedValue(null) },
          },
        }),
      query: {
        // prettier-ignore
        subscriptions: { findFirst: vi.fn().mockResolvedValue({ id: 'sub-1', userId: 'user-123', status: 'active' }) },
        agentClients: { findFirst: vi.fn().mockResolvedValue(null) },
        tenantSettings: { findFirst: vi.fn().mockResolvedValue(null) },
        claims: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'claim-1',
            userId: 'user-123',
            title: 'Test Claim',
            status: 'submitted',
          }),
        },
        user: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'user-123',
            email: 'user@example.com',
          }),
        },
        tenants: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'tenant_mk',
            countryCode: 'MK',
          }),
        },
      },
    },
    withTenantContext: async (_context: unknown, action: (tx: unknown) => Promise<unknown>) =>
      moduleMock.db.transaction(action),
    subscriptions: {
      id: { name: 'id' },
      userId: { name: 'userId' },
      tenantId: { name: 'tenantId' },
      branchId: { name: 'branchId' },
      agentId: { name: 'agentId' },
    },
    agentClients: {
      tenantId: { name: 'tenantId' },
      memberId: { name: 'memberId' },
      status: { name: 'status' },
    },
    claims: { id: 'id', lifecycleVersion: 'lifecycleVersion', status: 'status', tenantId: {} },
    claimEscalationAgreements: {
      claimId: 'claimId',
      paymentAuthorizationState: 'payment',
      tenantId: {},
    },
    claimStageHistory: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
    claimDocuments: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
    // prettier-ignore
    claimDocumentAiExtractionConsents: { id: { name: 'id' }, tenantId: { name: 'tenantId' }, actorId: { name: 'actorId' }, subjectId: { name: 'subjectId' }, claimId: { name: 'claimId' }, documentId: { name: 'documentId' }, consentType: { name: 'consentType' }, processingPurpose: { name: 'processingPurpose' }, status: { name: 'status' }, privacyVersion: { name: 'privacyVersion' }, locale: { name: 'locale' }, sourceSurface: { name: 'sourceSurface' }, recordedAt: { name: 'recordedAt' }, grantedAt: { name: 'grantedAt' }, withdrawnAt: { name: 'withdrawnAt' } },
    documents: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
    aiRuns: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
    user: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
    tenantSettings: {
      tenantId: { name: 'tenantId' },
      category: { name: 'category' },
      key: { name: 'key' },
    },
    tenants: {
      id: { name: 'id' },
      code: { name: 'code' },
      countryCode: { name: 'countryCode' },
    },
    claimCounters: {
      tenantId: { name: 'tenantId' },
      year: { name: 'year' },
      lastNumber: { name: 'lastNumber' },
    },
    and: vi.fn(),
    eq: vi.fn(),
    sql: (_strings: TemplateStringsArray, ..._values: unknown[]) => 'sql-mock',
  };
  return moduleMock;
}

export function tenantDirectoryModuleMock() {
  return {
    readTenantLocaleMetadata: vi.fn().mockResolvedValue({ code: 'MK', countryCode: 'MK' }),
  };
}

export function claimNumberModuleMock() {
  return { generateClaimNumber: vi.fn().mockResolvedValue('CLM-MK-2026-000001') };
}

export function authModuleMock() {
  return { auth: { api: { getSession: () => mockGetSession() } } };
}

export function nanoidModuleMock() {
  return { nanoid: () => 'test-id' };
}

export function nextCacheModuleMock() {
  return { revalidatePath: vi.fn() };
}

export function nextHeadersModuleMock() {
  return { headers: vi.fn() };
}

export function notificationsModuleMock() {
  return {
    notifyClaimSubmitted: vi.fn().mockResolvedValue({ success: true }),
    notifyStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  };
}

export function aiClaimWorkflowsModuleMock() {
  return {
    emitClaimAiRunRequestedService: vi.fn().mockResolvedValue(undefined),
    markClaimAiRunDispatchFailedService: vi.fn().mockResolvedValue(undefined),
  };
}

export function auditModuleMock() {
  return { logAuditEvent: vi.fn().mockResolvedValue(undefined) };
}

export function initialClaimUploadModuleMock() {
  return { validateInitialClaimEvidenceUpload: mockValidateInitialClaimEvidenceUpload };
}

export function resetClaimActionMocks() {
  vi.clearAllMocks();
  mockValidateInitialClaimEvidenceUpload.mockResolvedValue(undefined);
  mockTxSelectLimit.mockResolvedValue([submittedLifecycleCurrentClaim]);
  mockTxUpdateReturning.mockResolvedValue([{ id: 'claim-1', lifecycleVersion: 2 }]);
  mockHasActiveMembership.mockResolvedValue(true);
  mockGetActiveSubscription.mockResolvedValue({
    id: 'sub-def',
    userId: 'user-123',
    branchId: 'branch-1',
    agentId: 'agent-1',
    status: 'active',
  });
  process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET = 'claim-evidence';
}
