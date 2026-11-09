import { eq, subscriptions } from '@interdomestik/database';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { describe, expect, it } from 'vitest';

import { type CoverageEntry, evaluateCoverage } from '../sponsor-coverage/evaluate';
import { cacheStatusValues, planCacheStatuses } from './cache-job';

const row = {
  id: 'subscription',
  userId: 'member',
  provider: 'group_sponsor',
  status: 'canceled',
} as const;
const sponsored = [{ userId: 'member', membership: { source: 'sponsor' } }];

describe('sponsor cache plan', () => {
  it('preserves updatedAt despite the ORM hook, without issuing a database query', () => {
    const compiler = drizzle(async () => {
      throw new Error('SQL generation must not execute');
    });
    const query = compiler
      .update(subscriptions)
      .set(cacheStatusValues('active'))
      .where(eq(subscriptions.tenantId, 'tenant'))
      .toSQL();
    expect(query.sql).toContain('set "status" = $1, "updated_at" = "subscriptions"."updated_at"');
    expect(query.params).toEqual(['active', 'tenant']);
  });
  it('activates source 1 coverage and cancels people absent from it', () => {
    expect(planCacheStatuses([row], sponsored)).toEqual([{ id: row.id, status: 'active' }]);
    expect(planCacheStatuses([{ ...row, status: 'active' }], [])).toEqual([
      { id: row.id, status: 'canceled' },
    ]);
  });
  it.each(['subscription', 'none', 'unknown'])(
    'never treats source %s as sponsor coverage',
    source => {
      expect(
        planCacheStatuses(
          [{ ...row, status: 'active' }],
          [{ userId: row.userId, membership: { source } }]
        )
      ).toEqual([{ id: row.id, status: 'canceled' }]);
    }
  );
  it.each(['paddle', 'manual', '', null])(
    'never updates provider %s, even with source 1 coverage',
    provider => {
      expect(planCacheStatuses([{ ...row, provider }], sponsored)).toEqual([]);
      expect(planCacheStatuses([{ ...row, provider, status: 'active' }], [])).toEqual([]);
    }
  );
  it('writes only changes, does not mutate rows and does not copy coverage between people', () => {
    const input = Object.freeze([
      Object.freeze(row),
      Object.freeze({ ...row, id: 'second', userId: 'other', status: 'active' } as const),
    ]);
    expect(planCacheStatuses(input, sponsored)).toEqual([
      { id: row.id, status: 'active' },
      { id: 'second', status: 'canceled' },
    ]);
    expect(input[0]?.status).toBe('canceled');
    expect(planCacheStatuses([{ ...row, status: 'active' }], sponsored)).toEqual([]);
    expect(planCacheStatuses([row], [])).toEqual([]);
    expect(planCacheStatuses([], sponsored)).toEqual([]);
  });
  it('deduplicates coverage and changes any stale sponsor cache status using only status', () => {
    for (const status of ['past_due', 'paused', 'trialing', 'expired'] as const) {
      expect(planCacheStatuses([{ ...row, status }], [...sponsored, ...sponsored])).toEqual([
        { id: row.id, status: 'active' },
      ]);
    }
  });
  it('respects resolver boundaries, revocation and eligibility rather than the cached status', () => {
    const entry: CoverageEntry = {
      id: 'entry',
      termId: 'term',
      sponsorId: 'sponsor',
      termStart: new Date('2026-01-01'),
      termEnd: new Date('2027-01-01'),
      terminatedEffectiveAt: null,
      termEffective: true,
      planId: 'standard',
      planKey: 'plan',
      legalEntityId: 'entity',
      conflictDecision: 'accepted',
      revokedAt: null,
      outcome: 'seated',
      startsAt: new Date('2026-01-01'),
      handoverPaidUntil: null,
    };
    const changeFor = (
      at: string,
      extra: Partial<CoverageEntry> = {}
    ): ReturnType<typeof planCacheStatuses> => {
      const membership = evaluateCoverage(
        { subscription: row, entries: [{ ...entry, ...extra }] },
        new Date(at)
      );
      return planCacheStatuses(
        [{ ...row, status: 'past_due' }],
        [{ userId: row.userId, membership }]
      );
    };
    expect(changeFor('2026-01-01')).toEqual([{ id: row.id, status: 'active' }]);
    for (const [at, extra] of [
      ['2025-12-31', {}],
      ['2027-01-01', {}],
      ['2026-06-01', { conflictDecision: 'rejected' }],
      ['2026-06-01', { outcome: 'staff_review' }],
      ['2026-06-01', { revokedAt: new Date('2026-05-01') }],
      ['2026-06-01', { terminatedEffectiveAt: new Date('2026-06-01') }],
    ] as const) {
      expect(changeFor(at, extra)).toEqual([{ id: row.id, status: 'canceled' }]);
    }
  });
});
