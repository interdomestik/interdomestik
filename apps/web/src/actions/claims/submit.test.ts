import {
  authority,
  mockRateLimit,
  mockRunCommercialActionWithIdempotency,
  mockSubmitClaimCoreDomain,
  validData,
  validSession,
} from './submit.test-support';
import { describe, expect, it, vi } from 'vitest';
import { submitClaimCore } from './submit.core';
import { submitClaimCore as submitClaimCoreDomain } from '@interdomestik/domain-claims/claims/submit';
import { kickClaimNotificationDeliveries } from '@/lib/claim-notification-delivery-kick';

describe('actions/claims/submit', () => {
  it('succeeds when rate limit allows', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });
    mockSubmitClaimCoreDomain.mockResolvedValueOnce({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
      deliveryIds: ['email-for-claim'],
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
    expect(kickClaimNotificationDeliveries).toHaveBeenCalledExactlyOnceWith(authority, [
      'email-for-claim',
    ]);
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
      deliveryIds: [],
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
      deliveryIds: [],
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
});
