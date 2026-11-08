import { describe, expect, it } from 'vitest';

import { type CoverageRow, groupCoverageRows, parseTimestamp } from './resolve';

const term = {
  id: 'term-1',
  sponsorId: 'sponsor-a',
  termStart: '2027-01-01 00:00:00+00',
  termEnd: '2028-01-01 00:00:00+00',
  terminatedEffectiveAt: null,
  planId: 'standard',
  planKey: 'plan-standard',
  legalEntityId: 'entity-ks',
} as CoverageRow['term'];

const entry = {
  id: 'entry-1',
  conflictDecision: 'accepted',
  revokedAt: null,
  outcome: 'seated',
  startsAt: '2027-01-01 00:00:00.25+00',
} as CoverageRow['entry'];

const subscription = { id: 'sub-1', provider: 'group_sponsor' } as CoverageRow['subscription'];

describe('parseTimestamp', () => {
  it('reads Postgres timestamptz text and fails closed on anything else', () => {
    expect(parseTimestamp('2027-01-01 00:00:00.25+00').toISOString()).toBe(
      '2027-01-01T00:00:00.250Z'
    );
    expect(parseTimestamp('2027-06-30 23:30:00+02:30').toISOString()).toBe(
      '2027-06-30T21:00:00.000Z'
    );
    expect(() => parseTimestamp('soon')).toThrow('Unreadable sponsor timestamp');
  });
});

describe('groupCoverageRows', () => {
  it('collapses revision fan-out and marks the term effective on any approved decision', () => {
    const base = { userId: 'u1', subscription, entry, term, paidUntil: null };
    const people = groupCoverageRows([
      { ...base, approvedDecisionId: null },
      { ...base, approvedDecisionId: 'decision-2' },
      {
        userId: 'u2',
        subscription: null,
        entry: null,
        term: null,
        paidUntil: null,
        approvedDecisionId: null,
      },
    ]);
    expect(people.get('u1')?.subscription).toBe(subscription);
    expect(people.get('u1')?.entries).toHaveLength(1);
    expect(people.get('u1')?.entries[0]).toMatchObject({
      id: 'entry-1',
      termEffective: true,
      startsAt: new Date('2027-01-01T00:00:00.250Z'),
    });
    expect(people.get('u2')).toEqual({ subscription: null, entries: [] });
  });

  it('keeps a term ineffective without an approved decision', () => {
    const people = groupCoverageRows([
      { userId: 'u1', subscription: null, entry, term, paidUntil: null, approvedDecisionId: null },
    ]);
    expect(people.get('u1')?.entries[0]?.termEffective).toBe(false);
  });
});
