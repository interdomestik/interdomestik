import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitClaimCore } from './submit.core';
import { submitClaimCore as submitClaimCoreDomain } from '@interdomestik/domain-claims/claims/submit';

const mockRunCommercialActionWithIdempotency = vi.fn();
type SubmitClaimParams = Parameters<typeof submitClaimCore>[0];
type SubmitClaimSession = NonNullable<SubmitClaimParams['session']>;
type SubmitClaimData = SubmitClaimParams['data'];

// Mock domain logic
vi.mock('@interdomestik/domain-claims/claims/submit', () => ({
  submitClaimCore: vi.fn(),
  ClaimValidationError: class extends Error {
    code?: string;
    constructor(msg: string) {
      super(msg);
    }
  },
}));

// Mock rate limiter
const mockRateLimit = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: (...args: unknown[]) =>
    mockRunCommercialActionWithIdempotency(...args),
}));

// Mock notifications (though imported by core, we mock import)
vi.mock('@/lib/notifications', () => ({
  notifyClaimSubmitted: vi.fn(),
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('@/features/claims/upload/server/initial-claim-upload', () => ({
  validateInitialClaimEvidenceUpload: vi.fn().mockResolvedValue(undefined),
}));

describe('actions/claims/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunCommercialActionWithIdempotency.mockImplementation(async ({ execute }) => execute());
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

  it('succeeds when rate limit allows', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });
    mockSubmitClaimCoreDomain.mockResolvedValueOnce({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
    });

    const result = await submitClaimCore({
      idempotencyKey: 'claim-submit-1',
      session: validSession,
      requestHeaders: new Headers(),
      data: validData,
    });

    expect(result).toEqual({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
      commercialFlow: {
        escalationRequest: {
          claimCategory: 'transport',
          decision: 'declined',
          decisionReason: 'outside_launch_scope',
        },
        freeStartCompletion: {
          claimCategory: 'transport',
        },
      },
    });
    expect(mockRunCommercialActionWithIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claims.submit',
        scope: {
          kind: 'tenant',
          actorUserId: 'user-1',
          tenantId: 'tenant-1',
        },
        idempotencyKey: 'claim-submit-1',
        requestFingerprint: validData,
      })
    );
    expect(mockRateLimit).toHaveBeenCalled();
    expect(submitClaimCoreDomain).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        validateSubmittedClaimFile: expect.any(Function),
      })
    );
  });

  it('returns validated commercial escalation metadata for launch-scope claims', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });
    mockSubmitClaimCoreDomain.mockResolvedValueOnce({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
    });

    const result = await submitClaimCore({
      session: validSession,
      requestHeaders: new Headers(),
      data: {
        ...validData,
        category: 'vehicle',
      },
    });

    expect(result).toEqual({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
      commercialFlow: {
        escalationRequest: {
          claimCategory: 'vehicle',
          decision: 'requested',
          decisionReason: 'launch_scope_supported',
        },
        freeStartCompletion: {
          claimCategory: 'vehicle',
        },
      },
    });
  });

  it('forwards diaspora handoff context to the domain submit path', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });
    mockSubmitClaimCoreDomain.mockResolvedValueOnce({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
    });

    await submitClaimCore({
      session: validSession,
      requestHeaders: new Headers(),
      handoffContext: {
        source: 'diaspora-green-card',
        country: 'IT',
        incidentLocation: 'abroad',
      },
      data: {
        ...validData,
        category: 'travel',
      },
    });

    expect(submitClaimCoreDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        handoffContext: {
          source: 'diaspora-green-card',
          country: 'IT',
          incidentLocation: 'abroad',
        },
      }),
      expect.any(Object)
    );
  });

  it('fails when rate limited', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: true });

    const result = await submitClaimCore({
      session: validSession,
      requestHeaders: new Headers(),
      data: validData,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Too many requests');
    }
  });

  it('handles validation error from domain', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });
    // Import the mocked module to mock implementation
    const domain = await import('@interdomestik/domain-claims/claims/submit');
    vi.mocked(domain.submitClaimCore).mockRejectedValueOnce(
      new domain.ClaimValidationError('Invalid input')
    );

    const result = await submitClaimCore({
      session: validSession,
      requestHeaders: new Headers(),
      data: validData,
    });

    expect(result).toEqual({ success: false, error: 'Invalid input', code: undefined });
  });
});
