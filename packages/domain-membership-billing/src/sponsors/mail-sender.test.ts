import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  rows: [] as unknown[][],
  predicates: [] as unknown[],
  locks: [] as unknown[],
  writes: [] as unknown[],
  inTransaction: false,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => {
  const chain = (rows: unknown[]): object => {
    const query = {
      from: (): object => query,
      innerJoin: (): object => query,
      leftJoin: (): object => query,
      where: (condition: unknown): object => {
        fake.predicates.push(condition);
        return query;
      },
      orderBy: (): object => query,
      limit: (): object => query,
      for: (strength: string, config: unknown): object => {
        fake.locks.push([strength, config]);
        return query;
      },
      set: (values: unknown): object => {
        fake.writes.push(values);
        return query;
      },
      returning: (): object => query,
      then: (resolve: (result: unknown[]) => unknown): Promise<unknown> =>
        Promise.resolve(rows).then(resolve),
    };
    return query;
  };
  return {
    withTenantAuthority: async (
      _authority: unknown,
      work: (tx: unknown) => Promise<unknown>
    ): Promise<unknown> => {
      fake.inTransaction = true;
      try {
        return await work({
          select: (): object => chain(fake.rows.shift() ?? []),
          update: (): object => chain([{ id: 'm1' }]),
        });
      } finally {
        fake.inTransaction = false;
      }
    },
  };
});

import { claimDueMail, finishMail, mailLeaseUntil } from './mail-outbox';
import {
  deliverSponsorMail,
  runSponsorMailOutbox,
  sponsorMailInput,
  type PreparedMail,
  type SponsorMailDeps,
} from './mail-sender';
import { optOutToken } from './roster-crypto';

const now = new Date('2027-01-01T00:00:00.000Z');
const lease = { id: 'm1', leaseUntil: mailLeaseUntil(now) };
const authority = mintTestTenantAuthority('tenant-1');
function deps(): SponsorMailDeps {
  return {
    secret: 'x'.repeat(32),
    locale: 'en',
    appUrl: 'https://tenant.example/',
    supportEmail: 'help@example.test',
    formatDate: (date: Date): string => date.toISOString(),
    hasCredential: vi.fn(async () => false),
    sendMail: vi.fn(async () => ({ ok: true })),
    sendActivation: vi.fn(async () => ({ ok: true })),
  };
}
function mail(overrides: Partial<PreparedMail> = {}): PreparedMail {
  return {
    kind: 'sponsor_notice',
    entryId: 'e1',
    recipient: 'current@example.test',
    firstName: 'Ana',
    companyName: 'Company',
    entityName: 'Controller',
    start: now,
    end: new Date('2028-01-01'),
    check: { send: true },
    ...overrides,
  };
}
const sqlQueries = (): { sql: string; params: unknown[] }[] =>
  fake.predicates.map(value => new PgDialect().sqlToQuery(value as SQL));

beforeEach(() => {
  fake.rows = [];
  fake.predicates = [];
  fake.locks = [];
  fake.writes = [];
  fake.inTransaction = false;
});

describe('mail lease and completion', () => {
  it('claims queued due and expired leases with SKIP LOCKED and one batched increment', async () => {
    fake.rows.push([{ id: 'm1' }, { id: 'm2' }]);
    expect(await claimDueMail(authority, now, 2)).toEqual(['m1', 'm2']);
    expect(fake.locks).toEqual([['update', { skipLocked: true }]]);
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]).toMatchObject({
      state: 'claimed',
      leaseUntil: '2027-01-01T00:10:00.000Z',
    });
    const [select, update] = sqlQueries();
    expect(select?.sql).toContain('"next_attempt_at" <=');
    expect(select?.sql).toContain('"lease_until" <');
    expect(select?.params).toEqual([
      'tenant-1',
      'queued',
      now.toISOString(),
      'claimed',
      now.toISOString(),
    ]);
    expect(update?.params).toEqual(['tenant-1', 'm1', 'm2']);
    expect(await claimDueMail(authority, now, 0)).toEqual([]);
  });

  it('fences both the completion read and write by tenant, id, claimed state and exact lease', async () => {
    fake.rows.push([{ attempts: 2 }]);
    expect(await finishMail(authority, lease, { state: 'sent' }, now)).toBe('sent');
    for (const query of sqlQueries())
      expect(query.params).toEqual(['tenant-1', 'm1', 'claimed', lease.leaseUntil]);
    expect(fake.writes[0]).toMatchObject({
      state: 'sent',
      terminalAt: now.toISOString(),
      leaseUntil: null,
    });
    fake.writes = [];
    expect(await finishMail(authority, lease, { state: 'sent' }, now)).toBe('lease_lost');
    expect(fake.writes).toEqual([]);
  });
});

describe('mail delivery', () => {
  it('passes controller, dates and derived opt-out URL using the tenant origin', async () => {
    const d = deps();
    expect(sponsorMailInput(mail(), d)).toMatchObject({
      entityName: 'Controller',
      startDate: now.toISOString(),
      optOutUrl: `https://tenant.example/sponsor/opt-out/${optOutToken(d.secret, 'e1')}`,
      loginUrl: 'https://tenant.example/en/login',
    });
    expect(await deliverSponsorMail(mail(), d)).toEqual({ state: 'sent' });
    expect(d.sendMail).toHaveBeenCalledWith(
      'current@example.test',
      expect.objectContaining({
        kind: 'sponsor_notice',
        entityName: 'Controller',
        companyName: 'Company',
        startDate: now.toISOString(),
        optOutUrl: `https://tenant.example/sponsor/opt-out/${optOutToken(d.secret, 'e1')}`,
        loginUrl: 'https://tenant.example/en/login',
      })
    );
  });

  it.each([
    ['', '/en/pricing'],
    ['/', '/en/pricing'],
    ['///', '/en/pricing'],
    ['https://tenant.example', 'https://tenant.example/en/pricing'],
    ['https://tenant.example///', 'https://tenant.example/en/pricing'],
    ['https://tenant.example/a//b/', 'https://tenant.example/a//b/en/pricing'],
    ['https://tenant.example/\n', 'https://tenant.example/\n/en/pricing'],
    ['https://tenant.example' + '/'.repeat(50_000), 'https://tenant.example/en/pricing'],
  ])('preserves URL content while removing trailing slashes: %s', (appUrl, offerUrl) => {
    expect(sponsorMailInput(mail({ kind: 'membership_end_offer' }), { ...deps(), appUrl })).toEqual(
      expect.objectContaining({ offerUrl })
    );
  });

  it('uses only the auth activation helper and finishes after one success', async () => {
    const d = deps();
    expect(await deliverSponsorMail(mail({ kind: 'activation' }), d)).toEqual({ state: 'sent' });
    expect(d.sendActivation).toHaveBeenCalledWith('current@example.test');
    expect(d.sendMail).not.toHaveBeenCalled();
    expect(() => sponsorMailInput(mail({ kind: 'activation' }), d)).toThrow(
      'activation_requires_auth_helper'
    );
  });

  it('never sends rejected or erased work, and discards provider error text', async () => {
    const d = deps();
    expect(
      await deliverSponsorMail(mail({ check: { send: false, reason: 'before_start' } }), d)
    ).toEqual({ state: 'skipped', reason: 'before_start' });
    expect(await deliverSponsorMail(mail({ recipient: null }), d)).toEqual({
      state: 'skipped',
      reason: 'recipient_missing',
    });
    expect(d.sendMail).not.toHaveBeenCalled();
    d.sendMail = vi.fn(async () => ({ ok: false, code: 'private@example.test token=secret' }));
    expect(await deliverSponsorMail(mail(), d)).toEqual({ state: 'error', code: 'send_failed' });
    d.sendMail = vi.fn(async () => {
      throw new Error('private@example.test');
    });
    expect(await deliverSponsorMail(mail(), d)).toEqual({ state: 'error', code: 'send_exception' });
  });

  it.each(['intent', 'entry', 'missing_user'])(
    'resolves %s targets, commits before send and processes sequentially',
    async target => {
      const isIntent = target === 'intent';
      const exists = target !== 'missing_user';
      const row = {
        id: 'm1',
        kind: isIntent ? 'membership_end_offer' : 'opt_out_confirmation',
        rosterEntryId: isIntent ? null : 'e1',
        handoverIntentId: isIntent ? 'i1' : null,
        userId: isIntent ? 'u1' : null,
        attempts: 1,
      };
      const entryTarget = {
        entry: { userId: 'u1', emailNormalized: 'stale@example.test' },
        effectiveEnd: now.toISOString(),
      };
      fake.rows.push(
        [{ id: 'm1' }, { id: 'm2' }],
        [row],
        ...(!isIntent ? [[entryTarget]] : []),
        exists ? [{ email: 'current@example.test' }] : [],
        ...(exists ? [[]] : []),
        ...(isIntent ? [[{ id: 'i1' }]] : []),
        [row],
        []
      );
      const d = deps();
      d.sendMail = vi.fn(async () => {
        expect(fake.inTransaction).toBe(false);
        expect(fake.writes).toHaveLength(1);
        return { ok: true };
      });
      expect(await runSponsorMailOutbox(authority, d, { now, limit: 2 })).toEqual({
        claimed: 2,
        outcomes: { [exists ? 'sent' : 'skipped']: 1, lease_lost: 1 },
      });
      expect(d.sendMail).toHaveBeenCalledTimes(exists ? 1 : 0);
      if (exists)
        expect(d.sendMail).toHaveBeenCalledWith(
          'current@example.test',
          expect.objectContaining({ kind: row.kind })
        );
      expect(
        sqlQueries().some(query => query.params.includes('u1') && query.params.includes('tenant-1'))
      ).toBe(true);
    }
  );
});

it.each(['sponsor_notice', 'activation'] as const)(
  'settles %s suppression without retry or failure audit',
  async kind => {
    const dependencies = deps();
    dependencies.sendMail = vi.fn().mockResolvedValue({ ok: false, code: 'email_suppressed' });
    dependencies.sendActivation = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'email_suppressed' });
    const outcome = await deliverSponsorMail(mail({ kind }), dependencies);
    expect(outcome).toEqual({ state: 'skipped', reason: 'email_suppressed' });
    fake.rows = [[{ id: 'm1', attempts: 1, kind }]];
    expect(await finishMail(authority, lease, outcome, now)).toBe('skipped');
    expect(fake.writes).toContainEqual(
      expect.objectContaining({ state: 'skipped', leaseUntil: null, terminalAt: now.toISOString() })
    );
    // The transaction fake has no insert method: attempting a failure audit fails this test.
  }
);
