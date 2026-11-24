import {
  mockMarkClaimAiRunDispatchFailed,
  authority,
  mockRateLimit,
  mockRunCommercialActionWithIdempotency,
  mockSubmitClaimCoreDomain,
  validData,
  validSession,
} from './submit.test-support';
import { describe, expect, it } from 'vitest';
import { submitClaimCore } from './submit.core';

describe('claim submission authority', () => {
  it('marks a failed AI dispatch under the session authority, not a tenant id', async () => {
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
