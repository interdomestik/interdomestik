import { vi } from 'vitest';
import type {
  AuthorizedClaimTimelineContext,
  MemberDomainEventTimelineRow,
} from './member-domain-event-timeline';

type TimelineMockRow = Record<string, unknown>;

export const memberTimelineContext: AuthorizedClaimTimelineContext = {
  claimId: 'claim-1',
  tenantId: 'tenant-1',
  currentStatus: 'evaluation',
  createdAt: new Date('2026-03-14T09:00:00.000Z'),
  updatedAt: new Date('2026-03-15T09:00:00.000Z'),
};

export function memberTimelineEventRow(
  overrides: Partial<MemberDomainEventTimelineRow> = {}
): MemberDomainEventTimelineRow {
  return {
    aggregateVersion: 2,
    createdAt: new Date('2026-03-15T10:00:00.000Z'),
    entityType: 'claim',
    eventName: 'claim.status_changed',
    eventVersion: 1,
    id: 'event-1',
    note: null,
    payload: { fromStatus: 'submitted', toStatus: 'evaluation' },
    ...overrides,
  };
}

export function memberTimelineSelectChain(rows: MemberDomainEventTimelineRow[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  };
}

export function normalizeMemberTimelineMockRows(
  context: AuthorizedClaimTimelineContext,
  rows: TimelineMockRow[]
) {
  if (rows.length === 0) {
    return [
      {
        id: `fallback-${context.claimId}-${context.currentStatus}`,
        date: context.updatedAt ?? context.createdAt ?? new Date(),
        statusFrom: null,
        statusTo: context.currentStatus,
        labelKey: `claims-tracking.status.${context.currentStatus}`,
        note: null,
        isPublic: true,
      },
    ];
  }

  return rows.map(row => ({
    id: row.id,
    date: row.date ?? row.createdAt,
    statusFrom: row.statusFrom ?? row.fromStatus ?? null,
    statusTo: row.statusTo ?? row.toStatus,
    labelKey: row.labelKey ?? `claims-tracking.status.${row.statusTo ?? row.toStatus}`,
    note: row.note ?? null,
    isPublic: row.isPublic ?? true,
  }));
}
