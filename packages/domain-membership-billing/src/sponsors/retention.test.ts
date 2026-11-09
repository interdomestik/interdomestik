import { describe, expect, it } from 'vitest';

import {
  addMonths,
  canPurgeHandover,
  outboxRetentionCutoff,
  planOutboxDeletion,
  planRetention,
  type RetentionRows,
} from './retention-plan';

const date = (value: string): Date => new Date(value);
const term = {
  id: 'term',
  sponsorId: 'sponsor',
  termEnd: '2024-02-29T12:34:56.789Z',
  terminatedEffectiveAt: null,
};
type Entry = RetentionRows['entries'][number];
const entry = (id = 'entry', extra: Partial<Entry> = {}): Entry => ({
  id,
  termId: term.id,
  firstName: 'Test',
  lastName: 'Member',
  emailNormalized: 'member@example.test',
  emailHmac: 'hmac',
  optoutTokenHash: 'token',
  revokedAt: null,
  ...extra,
});
const rows = (extra: Partial<RetentionRows> = {}): RetentionRows => ({
  term,
  sponsorTerms: [term],
  entries: [entry()],
  outbox: [],
  ...extra,
});
const erased = {
  firstName: null,
  lastName: null,
  emailNormalized: null,
  emailHmac: null,
  optoutTokenHash: null,
};
const anniversary = date('2025-02-28T12:34:56.789Z');

describe('retention calendar boundaries', () => {
  it.each([
    ['2024-02-29', 12, '2025-02-28'],
    ['2024-02-29', 120, '2034-02-28'],
    ['2023-03-01', 12, '2024-03-01'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2024-03-31', -1, '2024-02-29'],
    ['2024-12-31', 2, '2025-02-28'],
  ])('adds calendar months to %s, clamping only the day', (start, count, end) => {
    const input = date(`${start}T12:34:56.789Z`);
    expect(addMonths(input, Number(count)).toISOString()).toBe(`${end}T12:34:56.789Z`);
    expect(input.toISOString()).toBe(`${start}T12:34:56.789Z`);
  });
  it('rejects invalid clocks, dates and month counts before planning erasure', () => {
    expect(() => addMonths(new Date(Number.NaN), 12)).toThrow();
    expect(() => addMonths(anniversary, 1.5)).toThrow();
    expect(() => addMonths(anniversary, Number.MAX_SAFE_INTEGER)).toThrow();
    expect(() => planRetention(rows(), new Date(Number.NaN))).toThrow();
    expect(() =>
      planRetention(rows({ term: { ...term, termEnd: 'invalid' } }), anniversary)
    ).toThrow();
  });
});

describe('roster retention', () => {
  it('erases every outcome at the same calendar anniversary and skips queued/claimed mail', () => {
    const entries = [
      'pending',
      'seated',
      'awaiting_paid_end',
      'foreign',
      'not_eligible',
      'staff_review',
    ].map(outcome => ({ ...entry(outcome), outcome }));
    const outbox: RetentionRows['outbox'] = [
      { id: 'queued', rosterEntryId: 'pending', state: 'queued', terminalAt: null },
      { id: 'claimed', rosterEntryId: 'foreign', state: 'claimed', terminalAt: null },
      { id: 'sent', rosterEntryId: 'seated', state: 'sent', terminalAt: term.termEnd },
      { id: 'other', rosterEntryId: 'other', state: 'queued', terminalAt: null },
    ];
    const input = rows({ entries, outbox });
    expect(planRetention(input, new Date(anniversary.getTime() - 1)).eraseAddressIds).toEqual([]);
    const plan = planRetention(input, anniversary);
    expect(plan.eraseAddressIds).toEqual(entries.map(row => row.id));
    expect(plan.invalidateTokenIds).toEqual(entries.map(row => row.id));
    expect(plan.eraseHmacIds).toEqual(entries.map(row => row.id));
    expect(plan.skipOutboxIds).toEqual(['queued', 'claimed']);
    expect(input.entries[0]?.emailNormalized).toBe('member@example.test');
  });
  it('invalidates revoked tokens immediately without erasing the address or HMAC early', () => {
    const input = rows({
      entries: [entry('revoked', { revokedAt: '2024-01-01T00:00:00Z' }), entry()],
    });
    expect(planRetention(input, date('2024-01-01T00:00:00Z'))).toEqual({
      skipOutboxIds: [],
      invalidateTokenIds: ['revoked'],
      eraseAddressIds: [],
      eraseHmacIds: [],
      purgeTerm: false,
    });
  });
  it('invalidates tokens at 30 elapsed days after the effective term end', () => {
    const boundary = date('2024-03-30T12:34:56.789Z');
    expect(planRetention(rows(), new Date(boundary.getTime() - 1)).invalidateTokenIds).toEqual([]);
    expect(planRetention(rows(), boundary).invalidateTokenIds).toEqual(['entry']);
    const terminated = rows({ term: { ...term, terminatedEffectiveAt: '2024-01-01T00:00:00Z' } });
    const plan = planRetention(terminated, date('2024-01-31T00:00:00Z'));
    expect(plan.invalidateTokenIds).toEqual(['entry']);
    expect(plan.eraseAddressIds).toEqual([]);
  });
  it('waits for the last sponsor term, including a future unapproved term, before HMAC erasure', () => {
    const latest = { ...term, id: 'future', termEnd: '2027-01-01T00:00:00Z' };
    const input = rows({
      sponsorTerms: [
        term,
        latest,
        { ...latest, id: 'other', sponsorId: 'other', termEnd: '2040-01-01' },
      ],
    });
    const early = planRetention(input, anniversary);
    expect(early.eraseAddressIds).toEqual(['entry']);
    expect(early.eraseHmacIds).toEqual([]);
    expect(planRetention(input, date('2027-12-31T23:59:59.999Z')).eraseHmacIds).toEqual([]);
    expect(planRetention(input, date('2028-01-01T00:00:00Z')).eraseHmacIds).toEqual(['entry']);
  });
  it('fails closed on a missing sponsor history and does not plan another term’s entries', () => {
    const input = rows({
      sponsorTerms: [],
      entries: [entry(), entry('foreign', { termId: 'other' })],
    });
    expect(planRetention(input, anniversary).eraseHmacIds).toEqual([]);
    expect(planRetention(input, anniversary).eraseAddressIds).toEqual(['entry']);
  });
  it('is idempotent after token/address/HMAC erasure, including partial prior erasure', () => {
    const input = rows({
      entries: [
        entry('done', erased),
        entry('partial', { firstName: null, optoutTokenHash: null }),
      ],
    });
    const plan = planRetention(input, anniversary);
    expect(plan.invalidateTokenIds).toEqual([]);
    expect(plan.eraseAddressIds).toEqual(['partial']);
    expect(plan.eraseHmacIds).toEqual(['partial']);
  });
});

describe('outbox and term purge', () => {
  it('deletes only terminal mail at its own 30-day boundary', () => {
    const now = date('2025-03-31T03:00:00Z');
    expect(outboxRetentionCutoff(now).toISOString()).toBe('2025-03-01T03:00:00.000Z');
    const old = '2025-03-01T03:00:00Z';
    const mail: RetentionRows['outbox'] = [
      ...(['sent', 'skipped', 'failed'] as const).map(state => ({
        id: state,
        state,
        rosterEntryId: 'entry',
        terminalAt: old,
      })),
      { id: 'intent', rosterEntryId: null, state: 'sent', terminalAt: old },
      {
        id: 'fresh',
        rosterEntryId: 'entry',
        state: 'skipped',
        terminalAt: '2025-03-01T03:00:00.001Z',
      },
      { id: 'queued', rosterEntryId: 'entry', state: 'queued', terminalAt: old },
      { id: 'claimed', rosterEntryId: 'entry', state: 'claimed', terminalAt: null },
      { id: 'missing', rosterEntryId: 'entry', state: 'sent', terminalAt: null },
    ];
    expect(planOutboxDeletion(mail, now)).toEqual(['sent', 'skipped', 'failed', 'intent']);
  });
  it('purges a whole term only at ten calendar years, after all erasure steps', () => {
    const boundary = date('2034-02-28T12:34:56.789Z');
    expect(planRetention(rows(), new Date(boundary.getTime() - 1)).purgeTerm).toBe(false);
    const plan = planRetention(rows(), boundary);
    expect(plan.purgeTerm).toBe(true);
    expect(plan.eraseAddressIds).toEqual(['entry']);
    expect(plan.eraseHmacIds).toEqual(['entry']);
  });
  it('defers the whole term for surviving mail, including freshly skipped work', () => {
    const input = rows({
      outbox: [{ id: 'pending', rosterEntryId: 'entry', state: 'claimed', terminalAt: null }],
    });
    const now = date('2035-01-01T00:00:00Z');
    const plan = planRetention(input, now);
    expect(plan.skipOutboxIds).toEqual(['pending']);
    expect(plan.purgeTerm).toBe(false);
    const skipped = rows({
      outbox: [
        { id: 'pending', rosterEntryId: 'entry', state: 'skipped', terminalAt: now.toISOString() },
      ],
    });
    expect(planRetention(skipped, now).purgeTerm).toBe(false);
  });
  it('does not bypass the HMAC schedule when a sponsor still has later terms', () => {
    const input = rows({
      sponsorTerms: [term, { ...term, id: 'later', termEnd: '2035-01-01T00:00:00Z' }],
    });
    expect(planRetention(input, date('2034-03-01')).purgeTerm).toBe(false);
    expect(
      planRetention({ ...input, entries: [entry('erased', erased)] }, date('2034-03-01')).purgeTerm
    ).toBe(true);
  });
});

describe('handover evidence retention', () => {
  const closed = {
    linkedEntries: 0,
    intentOutboxRows: 0,
    reconciliationClosedAt: '2030-01-01',
    attempts: [],
  };
  it('allows an orphan only with closed reconciliation and unsent or resolved settlement', () => {
    expect(canPurgeHandover(closed)).toBe(true);
    expect(
      canPurgeHandover({
        ...closed,
        attempts: [{ outcome: 'scheduled' }, { outcome: 'refused' }, { outcome: 'moot' }],
      })
    ).toBe(true);
  });
  it('retains unresolved intent/attempt/charge evidence even after every linked entry is gone', () => {
    expect(
      canPurgeHandover({ ...closed, attempts: [{ outcome: 'scheduled' }, { outcome: 'unknown' }] })
    ).toBe(false);
  });
  it('requires every reference and reconciliation condition independently', () => {
    expect(canPurgeHandover({ ...closed, linkedEntries: 1 })).toBe(false);
    expect(canPurgeHandover({ ...closed, intentOutboxRows: 1 })).toBe(false);
    expect(canPurgeHandover({ ...closed, reconciliationClosedAt: null })).toBe(false);
  });
});
