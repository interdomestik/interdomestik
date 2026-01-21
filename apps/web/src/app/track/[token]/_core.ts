import { type ClaimStatus } from '@interdomestik/database/constants';

export interface TrackingViewDTO {
  claimId: string;
  status: ClaimStatus;
  statusLabelKey: string;
  lastUpdatedAt: Date;
  nextStepKey: string;
}

export type TrackingViewResult =
  | { ok: true; data: TrackingViewDTO }
  | { ok: false; code: 'NOT_FOUND' | 'INTERNAL' };

export interface TrackingServices {
  getPublicClaimStatusFn: (token: string) => Promise<{
    claimId: string;
    status: ClaimStatus;
    statusLabelKey: string;
    lastUpdatedAt: Date | string;
    nextStepKey: string;
  } | null>;
  logTrackingAttemptFn?: (args: {
    token: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
  }) => Promise<void>;
}

/**
 * Pure core logic for the Public Tracking Page.
 * Uses injected services to fetch claim status and log attempts.
 */
export async function getTrackingViewCore(
  params: {
    token: string;
    ipAddress?: string;
    userAgent?: string;
  },
  services: TrackingServices
): Promise<TrackingViewResult> {
  const { token, ipAddress, userAgent } = params;

  try {
    const data = await services.getPublicClaimStatusFn(token);

    if (!data) {
      if (services.logTrackingAttemptFn) {
        await services.logTrackingAttemptFn({ token, ipAddress, userAgent, success: false });
      }
      return { ok: false, code: 'NOT_FOUND' };
    }

    if (services.logTrackingAttemptFn) {
      await services.logTrackingAttemptFn({ token, ipAddress, userAgent, success: true });
    }

    return {
      ok: true,
      data: {
        claimId: data.claimId,
        status: data.status,
        statusLabelKey: data.statusLabelKey,
        lastUpdatedAt:
          data.lastUpdatedAt instanceof Date ? data.lastUpdatedAt : new Date(data.lastUpdatedAt),
        nextStepKey: data.nextStepKey,
      },
    };
  } catch (error) {
    console.error('[TrackingViewCore] Error fetching tracking view:', error);
    return { ok: false, code: 'INTERNAL' };
  }
}
