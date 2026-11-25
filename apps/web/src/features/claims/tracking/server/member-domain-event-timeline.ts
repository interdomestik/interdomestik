import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
import { UnauthorizedError } from '@interdomestik/shared-auth';
import {
  and,
  claimStageHistory,
  desc,
  domainEvents,
  eq,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { ClaimTimelineEvent } from '../types';
import {
  type MemberEventPresentationRow,
  presentMemberDomainEvent,
} from './member-event-presentation-registry';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

const GENERIC_EVENT_LABEL = 'claims-tracking.tracking.timeline.generic';
const REDACTED_EVENT_LABEL = 'claims-tracking.tracking.timeline.redacted';

export type AuthorizedClaimTimelineContext = {
  claimId: string;
  tenantId: string;
  currentStatus: ClaimStatus;
  createdAt: Date | null;
  piiStatus?: 'available' | 'erased_or_unavailable';
  updatedAt: Date | null;
};

export type MemberDomainEventTimelineRow = MemberEventPresentationRow & {
  aggregateVersion: number;
  entityType: string;
};

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
  const piiStatus =
    context.piiStatus === 'erased_or_unavailable' || options.piiStatus === 'erased_or_unavailable'
      ? 'erased_or_unavailable'
      : 'available';

  return presentMemberDomainEvent(
    {
      currentStatus: context.currentStatus,
      piiStatus,
    },
    row
  );
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
  context: AuthorizedClaimTimelineContext,
  database?: TenantTransaction
): Promise<ClaimTimelineEvent[]> {
  const admission = await requireAdmittedMember();
  if (!admission.ok) throw new UnauthorizedError();
  const { authority } = admission.authorized;
  // Fail closed unless the claim context belongs to the tenant the authority grants.
  if (readTenantAuthority(authority).tenantId !== context.tenantId) {
    throw new Error('Claim timeline tenant does not match the tenant authority');
  }

  if (database) return await readTimeline(context, database);
  return withTenantAuthority(authority, async tx => await readTimeline(context, tx));
}

async function readTimeline(
  context: AuthorizedClaimTimelineContext,
  database: TenantTransaction
): Promise<ClaimTimelineEvent[]> {
  const rows = await database
    .select({
      aggregateVersion: domainEvents.aggregateVersion,
      createdAt: domainEvents.createdAt,
      entityType: domainEvents.entityType,
      eventName: domainEvents.eventName,
      eventVersion: domainEvents.eventVersion,
      id: domainEvents.id,
      note: claimStageHistory.note,
      payload: domainEvents.payload,
    })
    .from(domainEvents)
    .innerJoin(
      claimStageHistory,
      and(
        eq(claimStageHistory.tenantId, domainEvents.tenantId),
        eq(claimStageHistory.claimId, domainEvents.entityId),
        eq(claimStageHistory.createdAt, domainEvents.createdAt),
        eq(
          sql<string>`${claimStageHistory.fromStatus}::text`,
          sql<string>`${domainEvents.payload}->>'fromStatus'`
        ),
        eq(
          sql<string>`${claimStageHistory.toStatus}::text`,
          sql<string>`${domainEvents.payload}->>'toStatus'`
        ),
        eq(claimStageHistory.isPublic, true)
      )
    )
    .where(
      and(
        eq(domainEvents.tenantId, context.tenantId),
        eq(domainEvents.entityId, context.claimId),
        eq(domainEvents.entityType, 'claim'),
        eq(domainEvents.eventName, 'claim.status_changed')
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
