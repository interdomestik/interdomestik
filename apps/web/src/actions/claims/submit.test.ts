import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitClaimCore } from './submit.core';
import { submitClaimCore as submitClaimCoreDomain } from '@interdomestik/domain-claims/claims/submit';

const mockRunCommercialActionWithIdempotency = vi.fn();

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
  enforceRateLimitForAction: (...args: any[]) => mockRateLimit(...args),
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

describe('actions/claims/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunCommercialActionWithIdempotency.mockImplementation(async ({ execute }) => execute());
  });

  const validData = {
    category: 'transport',
    title: 'Damaged Goods',
    companyName: 'Transport Co',
    description: 'Received damaged goods during shipment',
    files: [],
  };

  const validSession = {
    user: { id: 'user-1', role: 'member', tenantId: 'tenant-1' },
    excludes: () => false,
  };

  it('succeeds when rate limit allows', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });
    (submitClaimCoreDomain as any).mockResolvedValueOnce({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
    });

    const result = await submitClaimCore({
      idempotencyKey: 'claim-submit-1',
      session: validSession as any,
      requestHeaders: new Headers(),
      data: validData as any,
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
        actorUserId: 'user-1',
        tenantId: 'tenant-1',
        idempotencyKey: 'claim-submit-1',
        requestFingerprint: validData,
      })
    );
    expect(mockRateLimit).toHaveBeenCalled();
  });

  it('returns validated commercial escalation metadata for launch-scope claims', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });
    (submitClaimCoreDomain as any).mockResolvedValueOnce({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
    });

    const result = await submitClaimCore({
      session: validSession as any,
      requestHeaders: new Headers(),
      data: {
        ...validData,
        category: 'vehicle',
      } as any,
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
    (submitClaimCoreDomain as any).mockResolvedValueOnce({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
    });

    await submitClaimCore({
      session: validSession as any,
      requestHeaders: new Headers(),
      handoffContext: {
        source: 'diaspora-green-card',
        country: 'IT',
        incidentLocation: 'abroad',
      },
      data: {
        ...validData,
        category: 'travel',
      } as any,
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
      session: validSession as any,
      requestHeaders: new Headers(),
      data: validData as any,
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
    (domain.submitClaimCore as any).mockRejectedValueOnce(
      new domain.ClaimValidationError('Invalid input')
    );

    const result = await submitClaimCore({
      session: validSession as any,
      requestHeaders: new Headers(),
      data: validData as any,
    });

    expect(result).toEqual({ success: false, error: 'Invalid input', code: undefined });
  });
});
