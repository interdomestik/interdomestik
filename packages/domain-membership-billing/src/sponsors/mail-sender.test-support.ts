import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { afterEach, beforeEach, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  rows: [] as unknown[][],
  answerSelect: undefined as
    ((columns?: Record<string, unknown>) => unknown[] | undefined) | undefined,
  predicates: [] as unknown[],
  locks: [] as unknown[],
  writes: [] as unknown[],
  inTransaction: false,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => {
  const chain = (rows: unknown[]): object => {
    const query = Object.assign(Promise.resolve(rows), {
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
    });
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
          select: (columns?: Record<string, unknown>): object =>
            chain(fake.answerSelect?.(columns) ?? fake.rows.shift() ?? []),
          update: (): object => chain([{ id: 'm1' }]),
        });
      } finally {
        fake.inTransaction = false;
      }
    },
  };
});

import { mailLeaseUntil } from './mail-outbox';
import type { PreparedMail, SponsorMailDeps } from './mail-sender';

export const now = new Date('2027-01-01T00:00:00.000Z');
export const lease = { id: 'm1', leaseUntil: mailLeaseUntil(now) };
export let authority: ReturnType<typeof mintTestTenantAuthority>;
export function deps(): SponsorMailDeps {
  return {
    secret: 'x'.repeat(32),
    locale: 'en',
    appUrl: 'https://tenant.example/',
    supportEmail: 'help@example.test',
    formatDate: (date: Date): string => date.toISOString(),
    hasCredential: vi.fn(() => Promise.resolve(false)),
    sendMail: vi.fn(() => Promise.resolve({ ok: true })),
    sendActivation: vi.fn(() => Promise.resolve({ ok: true })),
    reportError: vi.fn(),
  };
}
export function mail(overrides: Partial<PreparedMail> = {}): PreparedMail {
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
    retentionDeadline: null,
    ...overrides,
  };
}
export const sqlQueries = (): { sql: string; params: unknown[] }[] =>
  fake.predicates.map(value => new PgDialect().sqlToQuery(value as SQL));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  authority = mintTestTenantAuthority('tenant-1');
  fake.rows = [];
  fake.answerSelect = undefined;
  fake.predicates = [];
  fake.locks = [];
  fake.writes = [];
  fake.inTransaction = false;
});
afterEach(() => vi.useRealTimers());

export { fake };
