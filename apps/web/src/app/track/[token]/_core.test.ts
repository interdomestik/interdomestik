import { type ClaimStatus } from '@interdomestik/database/constants';
import { describe, expect, it, vi } from 'vitest';
import { getTrackingViewCore, type TrackingServices } from './_core';

describe('getTrackingViewCore', () => {
  const mockServices: TrackingServices = {
    getPublicClaimStatusFn: vi.fn(),
    logTrackingAttemptFn: vi.fn(),
  };

  it('returns NOT_FOUND and logs failure if token invalid', async () => {
    vi.mocked(mockServices.getPublicClaimStatusFn).mockResolvedValue(null);
    const result = await getTrackingViewCore({ token: 'invalid' }, mockServices);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
    }
    expect(mockServices.logTrackingAttemptFn).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it('returns success and logs success if token valid', async () => {
    const mockData = {
      claimId: 'claim-123',
      status: 'submitted' as ClaimStatus,
      statusLabelKey: 'status.submitted',
      lastUpdatedAt: new Date(),
      nextStepKey: 'step.evaluation',
    };
    vi.mocked(mockServices.getPublicClaimStatusFn).mockResolvedValue(mockData);

    const result = await getTrackingViewCore({ token: 'valid' }, mockServices);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.claimId).toBe('claim-123');
      expect(result.data.status).toBe('submitted');
    }
    expect(mockServices.logTrackingAttemptFn).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });
});
