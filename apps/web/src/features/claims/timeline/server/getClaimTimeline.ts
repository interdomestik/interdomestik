/**
 * Get Claim Timeline
 * v2.1 — Phase 2.2 Lifecycle Timeline
 *
 * Fetches stage history for a claim with role-based visibility filtering.
 * Uses claimStageHistory as the single source of truth.
 */

import { db } from '@interdomestik/database';
import { claimStageHistory } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import { and, asc, eq } from 'drizzle-orm';

import { mapHistoryToTimeline, type RawHistoryRow } from '../mappers';
import type { ClaimTimelineResponse } from '../types';

export type TimelineViewerRole = 'admin' | 'staff' | 'member' | 'agent';

export interface GetClaimTimelineParams {
  claimId: string;
  tenantId: string;
  viewerRole: TimelineViewerRole;
}

/**
 * Check if viewer can see internal (non-public) entries.
 */
function canSeeInternalEntries(role: TimelineViewerRole): boolean {
  return role === 'admin' || role === 'staff';
}

/**
 * Fetch timeline for a claim.
 *
 * - Admin/Staff see all entries
 * - Member/Agent see only isPublic = true entries
 * - All queries are tenant-scoped
 * - Results ordered by createdAt ASC (chronological)
 */
export async function getClaimTimeline(
  params: GetClaimTimelineParams
): Promise<ClaimTimelineResponse> {
  const { claimId, tenantId, viewerRole } = params;

  try {
    const rows = await db
      .select({
        id: claimStageHistory.id,
        fromStatus: claimStageHistory.fromStatus,
        toStatus: claimStageHistory.toStatus,
        createdAt: claimStageHistory.createdAt,
        changedByRole: claimStageHistory.changedByRole,
        note: claimStageHistory.note,
        isPublic: claimStageHistory.isPublic,
      })
      .from(claimStageHistory)
      .where(and(eq(claimStageHistory.claimId, claimId), eq(claimStageHistory.tenantId, tenantId)))
      .orderBy(asc(claimStageHistory.createdAt));

    // Map and filter based on viewer role
    const showInternalEntries = canSeeInternalEntries(viewerRole);
    const entries = mapHistoryToTimeline(rows as RawHistoryRow[], {
      publicOnly: !showInternalEntries,
    });

    return {
      claimId,
      entries,
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { domain: 'claims', operation: 'getClaimTimeline' },
      extra: { claimId, tenantId, viewerRole },
    });

    // Return empty timeline on error
    return {
      claimId,
      entries: [],
    };
  }
}
