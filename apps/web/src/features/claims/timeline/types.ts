/**
 * Timeline Types for Claim Stage History
 * v2.1 — Phase 2.2 Lifecycle Timeline
 */

import type { ClaimStatus } from '@interdomestik/database/constants';

/**
 * Actor role who triggered the transition.
 */
export type TimelineActorRole = 'system' | 'staff' | 'member' | 'admin';

/**
 * Individual timeline entry DTO.
 * Rendered in claim detail pages.
 */
export interface TimelineEntry {
  id: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  timestamp: Date;
  actorRole: TimelineActorRole;
  note: string | null;
  isPublic: boolean;
}

/**
 * Timeline response DTO.
 */
export interface ClaimTimelineResponse {
  claimId: string;
  entries: TimelineEntry[];
}
