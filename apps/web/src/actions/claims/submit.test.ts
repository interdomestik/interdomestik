import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitClaimCore } from './submit.core';
import { submitClaimCore as submitClaimCoreDomain } from '@interdomestik/domain-claims/claims/submit';

const mockRunCommercialActionWithIdempotency = vi.fn();
const mockMarkClaimAiRunDispatchFailed = vi.fn();
const authority = mintTestTenantAuthority('tenant-1');
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

vi.mock('@/lib/ai/claim-workflows', () => ({
  emitClaimAiRunRequestedService: vi.fn(),
  markClaimAiRunDispatchFailedService: (...args: unknown[]) =>
    mockMarkClaimAiRunDispatchFailed(...args),
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
      authority,
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
          authority,
        },
        idempotencyKey: 'claim-submit-1',
        requestFingerprint: validData,
      })
    );
    expect(mockRateLimit).toHaveBeenCalled();
    expect(mockRunCommercialActionWithIdempotency.mock.calls[0]?.[0].scope.authority).toBe(
      authority
    );
    expect(submitClaimCoreDomain).toHaveBeenCalledWith(
      expect.objectContaining({ authority }),
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
      authority,
      session: validSession,
      requestHeaders: new Headers({ host: 'ks.localhost:3000' }),
      data: { ...validData, category: 'vehicle' },
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
    expect(submitClaimCoreDomain).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: 'tenant_ks' }),
      expect.any(Object)
    );
  });

  it('forwards diaspora handoff context to the domain submit path', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });
    mockSubmitClaimCoreDomain.mockResolvedValueOnce({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
    });

    await submitClaimCore({
      authority,
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
      authority,
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
      authority,
      session: validSession,
      requestHeaders: new Headers(),
      data: validData,
    });

    expect(result).toEqual({ success: false, error: 'Invalid input', code: undefined });
  });

  it('marks a failed AI dispatch under the session authority, not a tenant id', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });
    mockSubmitClaimCoreDomain.mockResolvedValueOnce({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
    });

    await submitClaimCore({
      authority,
      session: validSession,
      requestHeaders: new Headers(),
      data: validData,
    });

    const deps = mockSubmitClaimCoreDomain.mock.calls[0]?.[1];
    await deps?.markClaimAiRunDispatchFailed?.({ runId: 'run-1', message: 'dispatch failed' });

    expect(mockMarkClaimAiRunDispatchFailed).toHaveBeenCalledTimes(1);
    const call = mockMarkClaimAiRunDispatchFailed.mock.calls[0]?.[0];
    expect(call.authority).toBe(authority);
    expect(call).toMatchObject({ runId: 'run-1', message: 'dispatch failed' });
  });

  it('hands the idempotency layer a null authority when the caller holds none', async () => {
    mockRunCommercialActionWithIdempotency.mockResolvedValueOnce({
      success: false,
      error: 'Commercial action idempotency requires a tenant scope.',
      code: 'IDEMPOTENCY_TENANT_SCOPE_REQUIRED',
    });

    await submitClaimCore({
      idempotencyKey: 'claim-submit-1',
      authority: null,
      session: validSession,
      requestHeaders: new Headers(),
      data: validData,
    });

    expect(mockRunCommercialActionWithIdempotency.mock.calls[0]?.[0].scope.authority).toBeNull();
  });
});
