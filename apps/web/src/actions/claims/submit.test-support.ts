import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { submitClaimCore as submitClaimCoreDomain } from '@interdomestik/domain-claims/claims/submit';
import { beforeEach, vi } from 'vitest';
import type { submitClaimCore } from './submit.core';

const { mockRunCommercialActionWithIdempotency, mockMarkClaimAiRunDispatchFailed, mockRateLimit } =
  vi.hoisted(() => ({
    mockRunCommercialActionWithIdempotency: vi.fn(),
    mockMarkClaimAiRunDispatchFailed: vi.fn(),
    mockRateLimit: vi.fn(),
  }));
const authority = mintTestTenantAuthority('tenant-1');
type SubmitClaimParams = Parameters<typeof submitClaimCore>[0];
type SubmitClaimSession = NonNullable<SubmitClaimParams['session']>;
type SubmitClaimData = SubmitClaimParams['data'];

// Mock domain logic
vi.mock('@interdomestik/domain-claims/claims/submit', () => ({
  submitClaimCore: vi.fn(),
  ClaimValidationError: class extends Error {
    code?: string;
  },
}));

// Mock rate limiter
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: (...args: unknown[]) =>
    mockRunCommercialActionWithIdempotency(...args),
}));

vi.mock('@/lib/claim-notification-delivery-kick', () => ({
  kickClaimNotificationDeliveries: vi.fn(),
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/ai/claim-workflows', () => ({
  emitClaimAiRunRequestedService: vi.fn(),
  markClaimAiRunDispatchFailedService: (...args: unknown[]) =>
    mockMarkClaimAiRunDispatchFailed(...args),
}));

vi.mock('@/features/claims/upload/server/initial-claim-evidence-validation', () => ({
  validateInitialClaimEvidenceUpload: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRunCommercialActionWithIdempotency.mockImplementation(({ execute }) => execute());
});

const mockSubmitClaimCoreDomain = vi.mocked(submitClaimCoreDomain);

const validData: SubmitClaimData = {
  category: 'transport',
  title: 'Damaged Goods',
  companyName: 'Transport Co',
  description: 'Received damaged goods during shipment',
  currency: 'EUR',
  files: [],
};

const validSession: SubmitClaimSession = {
  session: {
    id: 'session-1',
    userId: 'user-1',
    token: 'session-token',
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
  },
  user: {
    id: 'user-1',
    name: 'Member User',
    email: 'member@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    role: 'member',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    memberNumber: 'MBR-T1-000001',
    tenantClassificationPending: false,
    agentId: 'agent-1',
    referralCode: 'REF-1',
  },
};

export {
  authority,
  mockMarkClaimAiRunDispatchFailed,
  mockRateLimit,
  mockRunCommercialActionWithIdempotency,
  mockSubmitClaimCoreDomain,
  validData,
  validSession,
};
