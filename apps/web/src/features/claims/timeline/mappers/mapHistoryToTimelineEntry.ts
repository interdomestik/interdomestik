/**
 * Map raw claimStageHistory row to TimelineEntry DTO.
 * v2.1 — Phase 2.2 Lifecycle Timeline
 *
 * Pure function — no side effects.
 */

import type { ClaimStatus } from '@interdomestik/database/constants';
import type { TimelineActorRole, TimelineEntry } from '../types';

/**
 * Raw row from claimStageHistory table.
 */
export interface RawHistoryRow {
  id: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  createdAt: Date | null;
  changedByRole: string | null;
  note: string | null;
  isPublic: boolean;
}

/**
 * Normalize role string to TimelineActorRole.
 */
function normalizeActorRole(role: string | null): TimelineActorRole {
  if (!role) return 'system';
  const lower = role.toLowerCase();
  if (lower.includes('admin')) return 'admin';
  if (lower.includes('staff')) return 'staff';
  if (lower.includes('member')) return 'member';
  return 'system';
}

/**
 * Map a single history row to timeline entry.
 */
export function mapHistoryToTimelineEntry(row: RawHistoryRow): TimelineEntry {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    timestamp: row.createdAt ?? new Date(),
    actorRole: normalizeActorRole(row.changedByRole),
    note: row.note,
    isPublic: row.isPublic,
  };
}

/**
 * Map array of history rows to timeline entries.
 * Optionally filter to public-only entries.
 */
export function mapHistoryToTimeline(
  rows: RawHistoryRow[],
  options: { publicOnly?: boolean } = {}
): TimelineEntry[] {
  const entries = rows.map(mapHistoryToTimelineEntry);

  if (options.publicOnly) {
    return entries.filter(e => e.isPublic);
  }

  return entries;
}
