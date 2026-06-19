import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  select: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  desc: vi.fn((column: unknown) => ({ column, order: 'desc' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  sql: vi.fn(() => 'payloadSql'),
}));

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  claimStageHistory: {
    claimId: 'claimStageHistory.claimId',
    createdAt: 'claimStageHistory.createdAt',
    fromStatus: 'claimStageHistory.fromStatus',
    isPublic: 'claimStageHistory.isPublic',
    note: 'claimStageHistory.note',
    tenantId: 'claimStageHistory.tenantId',
    toStatus: 'claimStageHistory.toStatus',
  },
  db: { select: hoisted.select },
  desc: hoisted.desc,
  domainEvents: {
    aggregateVersion: 'domainEvents.aggregateVersion',
    createdAt: 'domainEvents.createdAt',
    entityId: 'domainEvents.entityId',
    entityType: 'domainEvents.entityType',
    eventName: 'domainEvents.eventName',
    eventVersion: 'domainEvents.eventVersion',
    id: 'domainEvents.id',
    payload: 'domainEvents.payload',
    tenantId: 'domainEvents.tenantId',
  },
  eq: hoisted.eq,
  sql: hoisted.sql,
}));

import {
  buildMemberTimelineFromDomainEvents,
  getMemberTimelineFromDomainEvents,
  mapDomainEventToMemberTimelineEvent,
} from './member-domain-event-timeline';
import {
  memberTimelineContext as context,
  memberTimelineEventRow as eventRow,
  memberTimelineSelectChain as selectChain,
} from './member-domain-event-timeline.test-support';

describe('member domain-event timeline', () => {
  it('reads the authorized claim timeline with exactly one domain_events query', async () => {
    vi.clearAllMocks();
    const chain = selectChain([eventRow()]);
    hoisted.select.mockReturnValueOnce(chain);

    const result = await getMemberTimelineFromDomainEvents(context);

    expect(hoisted.select).toHaveBeenCalledTimes(1);
    expect(result[0]?.id).toBe('event-1');
    expect(chain.innerJoin).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'claimStageHistory.note' }),
      expect.objectContaining({
        args: expect.arrayContaining([
          { op: 'eq', left: 'claimStageHistory.isPublic', right: true },
        ]),
      })
    );
    expect(chain.limit).toHaveBeenCalledWith(200);
    expect(chain.where).toHaveBeenCalledWith({
      op: 'and',
      args: [
        { op: 'eq', left: 'domainEvents.tenantId', right: 'tenant-1' },
        { op: 'eq', left: 'domainEvents.entityId', right: 'claim-1' },
        { op: 'eq', left: 'domainEvents.entityType', right: 'claim' },
        { op: 'eq', left: 'domainEvents.eventName', right: 'claim.status_changed' },
      ],
    });
  });

  it('maps claim.status_changed@1 without actor, raw payload, or internal fields', () => {
    const result = mapDomainEventToMemberTimelineEvent(
      context,
      eventRow({ note: 'Member-visible guidance' })
    );

    expect(result).toEqual({
      id: 'event-1',
      date: new Date('2026-03-15T10:00:00.000Z'),
      statusFrom: 'submitted',
      statusTo: 'evaluation',
      labelKey: 'claims-tracking.status.evaluation',
      note: 'Member-visible guidance',
      isPublic: true,
    });
  });

  it('uses a fixed safe fallback for unknown versions and invalid payloads', () => {
    const fallbackEvents = [
      mapDomainEventToMemberTimelineEvent(context, eventRow({ eventVersion: 2 })),
      mapDomainEventToMemberTimelineEvent(
        context,
        eventRow({ payload: { fromStatus: 'submitted', toStatus: '<script>' } })
      ),
    ];

    expect(fallbackEvents).toEqual([
      expect.objectContaining({
        labelKey: 'claims-tracking.tracking.timeline.generic',
        statusTo: 'evaluation',
        note: null,
      }),
      expect.objectContaining({
        labelKey: 'claims-tracking.tracking.timeline.generic',
        statusTo: 'evaluation',
        note: null,
      }),
    ]);
  });

  it('keeps an erased timeline row structural but redacted', () => {
    expect(
      mapDomainEventToMemberTimelineEvent(context, eventRow(), {
        piiStatus: 'erased_or_unavailable',
      })
    ).toMatchObject({
      id: 'event-1',
      labelKey: 'claims-tracking.tracking.timeline.redacted',
      note: null,
      statusTo: 'evaluation',
    });
  });

  it('falls back to the authorized claim status when domain_events has no rows', () => {
    expect(buildMemberTimelineFromDomainEvents(context, [])).toEqual([
      {
        id: 'fallback-claim-1-evaluation',
        date: new Date('2026-03-15T09:00:00.000Z'),
        statusFrom: null,
        statusTo: 'evaluation',
        labelKey: 'claims-tracking.status.evaluation',
        note: null,
        isPublic: true,
      },
    ]);
    expect(
      buildMemberTimelineFromDomainEvents({ ...context, piiStatus: 'erased_or_unavailable' }, [])[0]
        ?.labelKey
    ).toBe('claims-tracking.tracking.timeline.redacted');
  });
});
