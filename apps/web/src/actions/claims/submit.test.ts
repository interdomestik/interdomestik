import { describe, expect, it, vi } from 'vitest';
import { submitClaimCore } from './submit.core';
import { submitClaimCore as submitClaimCoreDomain } from '@interdomestik/domain-claims/claims/submit';

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

// Mock notifications (though imported by core, we mock import)
vi.mock('@/lib/notifications', () => ({
  notifyClaimSubmitted: vi.fn(),
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

describe('actions/claims/submit', () => {
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
    });

    const result = await submitClaimCore({
      session: validSession as any,
      requestHeaders: new Headers(),
      data: validData as any,
    });

    expect(result).toEqual({ success: true, claimId: 'claim-1' });
    expect(mockRateLimit).toHaveBeenCalled();
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
