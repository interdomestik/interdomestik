import { and, db, desc, domainEvents, eq, inArray } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import type { ClaimTimelineEvent } from '../types';

const TIMELINE_ENTITY_TYPES = ['claim', 'case', 'recovery'] as const;
const GENERIC_EVENT_LABEL = 'claims-tracking.tracking.timeline.generic';
const REDACTED_EVENT_LABEL = 'claims-tracking.tracking.timeline.redacted';
const claimStatusSet = new Set<string>(CLAIM_STATUSES);

export type AuthorizedClaimTimelineContext = {
  claimId: string;
  tenantId: string;
  currentStatus: ClaimStatus;
  createdAt: Date | null;
  piiStatus?: 'available' | 'erased_or_unavailable';
  updatedAt: Date | null;
};

export type MemberDomainEventTimelineRow = {
  aggregateVersion: number;
  createdAt: Date;
  entityType: string;
  eventName: string;
  eventVersion: number;
  id: string;
  payload: Record<string, unknown>;
};

function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === 'string' && claimStatusSet.has(value);
}

function fallbackEvent(
  context: AuthorizedClaimTimelineContext,
  labelKey = GENERIC_EVENT_LABEL
): ClaimTimelineEvent {
  return {
    id: `fallback-${context.claimId}-${context.currentStatus}`,
    date: context.updatedAt ?? context.createdAt ?? new Date(),
    statusFrom: null,
    statusTo: context.currentStatus,
    labelKey,
    note: null,
    isPublic: true,
  };
}

export function mapDomainEventToMemberTimelineEvent(
  context: AuthorizedClaimTimelineContext,
  row: MemberDomainEventTimelineRow,
  options: { piiStatus?: 'available' | 'erased_or_unavailable' } = {}
): ClaimTimelineEvent {
  if (options.piiStatus === 'erased_or_unavailable') {
    return { ...fallbackEvent(context, REDACTED_EVENT_LABEL), id: row.id, date: row.createdAt };
  }

  if (row.eventName !== 'claim.status_changed' || row.eventVersion !== 1) {
    return { ...fallbackEvent(context), id: row.id, date: row.createdAt };
  }

  const { fromStatus, toStatus } = row.payload;
  if (!isClaimStatus(fromStatus) || !isClaimStatus(toStatus)) {
    return { ...fallbackEvent(context), id: row.id, date: row.createdAt };
  }

  return {
    id: row.id,
    date: row.createdAt,
    statusFrom: fromStatus,
    statusTo: toStatus,
    labelKey: `claims-tracking.status.${toStatus}`,
    note: null,
    isPublic: true,
  };
}

export function buildMemberTimelineFromDomainEvents(
  context: AuthorizedClaimTimelineContext,
  rows: MemberDomainEventTimelineRow[]
): ClaimTimelineEvent[] {
  const timeline = rows.map(row =>
    mapDomainEventToMemberTimelineEvent(context, row, { piiStatus: context.piiStatus })
  );
  if (timeline.length === 0) {
    const labelKey =
      context.piiStatus === 'erased_or_unavailable'
        ? REDACTED_EVENT_LABEL
        : `claims-tracking.status.${context.currentStatus}`;
    return [fallbackEvent(context, labelKey)];
  }
  return timeline;
}

export async function getMemberTimelineFromDomainEvents(
  context: AuthorizedClaimTimelineContext
): Promise<ClaimTimelineEvent[]> {
  const rows = await db
    .select({
      aggregateVersion: domainEvents.aggregateVersion,
      createdAt: domainEvents.createdAt,
      entityType: domainEvents.entityType,
      eventName: domainEvents.eventName,
      eventVersion: domainEvents.eventVersion,
      id: domainEvents.id,
      payload: domainEvents.payload,
    })
    .from(domainEvents)
    .where(
      and(
        eq(domainEvents.tenantId, context.tenantId),
        eq(domainEvents.entityId, context.claimId),
        // Case and recovery events use the claim id when emitted into the claim lifecycle stream.
        // Unknown event names render as fixed generic member-safe labels.
        inArray(domainEvents.entityType, TIMELINE_ENTITY_TYPES)
      )
    )
    .orderBy(
      desc(domainEvents.createdAt),
      desc(domainEvents.aggregateVersion),
      desc(domainEvents.id)
    )
    .limit(200);

  return buildMemberTimelineFromDomainEvents(context, rows);
}
