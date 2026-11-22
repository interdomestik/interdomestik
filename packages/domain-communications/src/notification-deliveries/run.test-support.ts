import type { TenantTransaction } from '@interdomestik/database';
import { auditLog, notificationDeliveries } from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { vi, type Mock } from 'vitest';
import { dispatchNotificationDeliveries, runNotificationDeliveries } from './run';
import type { Delivery, RunSummary } from './types';

const authority: TenantAuthority = mintTestTenantAuthority('tenant-a');
export const dialect = new PgDialect();
export const start = Date.parse('2026-11-22T12:00:00.000Z');
export const timestamp = (value: number) => new Date(value).toISOString();

export function delivery(changes: Partial<Delivery> = {}): Delivery {
  return {
    id: 'delivery',
    tenantId: 'tenant-a',
    claimId: 'claim',
    kind: 'claim_status_changed',
    channel: 'email',
    recipientUserId: 'member',
    subjectMessageId: null,
    pushSubscriptionId: null,
    idempotencyKey: 'key',
    facts: {},
    state: 'queued',
    attempts: 0,
    nextAttemptAt: timestamp(start),
    createdAt: timestamp(start),
    leaseUntil: null,
    terminalAt: null,
    sentAt: null,
    skipReason: null,
    locale: null,
    transport: null,
    avoidTransport: null,
    lastErrorCode: null,
    lastErrorDetail: null,
    ...changes,
  };
}

type Harness = {
  tx: TenantTransaction;
  queries: string[];
  audit: unknown[];
  sendEmail: Mock;
  sendPush: Mock;
  emailTransports: Mock<() => ('smtp' | 'resend')[]>;
  setClock(at: number): void;
  setWriteDelay(ms: number): void;
  loseLeaseAtWrite(): void;
  kick(ids?: string[]): Promise<RunSummary>;
  schedule(budgetMs?: number): Promise<RunSummary>;
};

export function harness(
  withAuthority: ReturnType<typeof vi.fn>,
  prepare: ReturnType<typeof vi.fn>,
  deliveries: Delivery[] = [delivery()]
): Harness {
  let clock = start;
  let transportWriteDelay = 0;
  let loseLeaseAtWrite = false;
  const sendEmail = vi.fn().mockImplementation(async transport => ({ ok: true, transport }));
  const sendPush = vi.fn().mockResolvedValue({ ok: true, transport: 'webpush' });
  const emailTransports = vi.fn<() => ('smtp' | 'resend')[]>().mockReturnValue(['smtp', 'resend']);
  const queries: string[] = [];
  const audit: unknown[] = [];

  const matches = (where: SQL, row: Delivery) => {
    const query = dialect.sqlToQuery(where);
    if (!query.params.includes(row.id)) return false;
    if (!query.sql.includes('"lease_until" ='))
      return !query.params.includes('failed') || row.state === 'failed';
    return row.state === 'claimed' && query.params.includes(row.leaseUntil);
  };

  const tx = {
    select: vi.fn((selection?: object) => ({
      from: () => ({
        where: (where: SQL) => ({
          orderBy: () => ({
            limit: () => ({
              for: async () => {
                const query = dialect.sqlToQuery(where);
                queries.push(query.sql);
                const ids = query.sql.includes(' in (') ? query.params.slice(3) : null;
                const candidate = deliveries
                  .filter(row => !ids || ids.includes(row.id))
                  .filter(
                    row =>
                      (row.state === 'queued' && Date.parse(row.nextAttemptAt) <= clock) ||
                      (row.state === 'claimed' && Date.parse(row.leaseUntil!) < clock)
                  )
                  .sort(
                    (a, b) =>
                      a.nextAttemptAt.localeCompare(b.nextAttemptAt) || a.id.localeCompare(b.id)
                  )[0];
                return candidate ? [{ ...candidate }] : [];
              },
            }),
          }),
          for: async () => (selection ? deliveries.filter(row => matches(where, row)) : []),
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (fields: Record<string, unknown>) => ({
        where: (where: SQL) => {
          const query = dialect.sqlToQuery(where);
          const isTransportWrite = query.sql.includes("interval '5 minutes'");
          const row = deliveries.find(item => matches(where, item));
          if (isTransportWrite && row && loseLeaseAtWrite)
            row.leaseUntil = timestamp(clock + 601_000);
          if (
            !row ||
            !matches(where, row) ||
            (isTransportWrite && Date.parse(row.leaseUntil!) - clock < 300_000)
          ) {
            return { returning: async () => [] };
          }
          for (const [key, value] of Object.entries(fields)) {
            if (value instanceof SQL) {
              const statement = dialect.sqlToQuery(value);
              type TimestampKey = 'leaseUntil' | 'nextAttemptAt' | 'terminalAt' | 'sentAt';
              const delay = key === 'leaseUntil' ? 600_000 : Number(statement.params[0] ?? 0);
              row[key as TimestampKey] = timestamp(clock + delay);
            } else Object.assign(row, { [key]: value });
          }
          if (isTransportWrite) clock += transportWriteDelay;
          return { returning: async () => [{ ...row }] };
        },
      }),
    })),
    insert: vi.fn(table => ({
      values: (fields: Delivery) => {
        if (table === auditLog) {
          audit.push(fields);
          return Promise.resolve();
        }
        if (table !== notificationDeliveries) throw new Error('Unexpected insert');
        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              if (
                deliveries.some(
                  row =>
                    row.tenantId === fields.tenantId && row.idempotencyKey === fields.idempotencyKey
                )
              )
                return [];
              deliveries.push(delivery(fields));
              return [{ id: fields.id }];
            },
          }),
        };
      },
    })),
  } as unknown as TenantTransaction;

  let pending: Promise<unknown> = Promise.resolve();
  withAuthority.mockImplementation((_authority, work) => {
    const next = pending.then(() => work(tx));
    pending = next.catch(() => undefined);
    return next;
  });
  prepare.mockImplementation(async (_tx, row: Delivery) =>
    row.channel === 'push'
      ? {
          channel: 'push',
          locale: 'mk',
          subscription: { endpoint: row.pushSubscriptionId },
          rendered: {},
        }
      : { channel: 'email', locale: 'mk', to: 'member@example.test', rendered: {} }
  );
  const deps = {
    appOrigin: () => 'https://example.test',
    buildStaffClaimScope: () => undefined,
    now: () => clock,
    sendEmail,
    sendPush,
    emailTransports,
    pushConfigured: () => true,
  };
  return {
    tx,
    queries,
    audit,
    sendEmail,
    sendPush,
    emailTransports,
    setClock: (at: number) => {
      clock = at;
    },
    setWriteDelay: (ms: number) => {
      transportWriteDelay = ms;
    },
    loseLeaseAtWrite: () => {
      loseLeaseAtWrite = true;
    },
    kick: (ids = deliveries.map(row => row.id)) =>
      dispatchNotificationDeliveries(authority, deps, { ids }),
    schedule: (budgetMs?: number) => runNotificationDeliveries(authority, deps, { budgetMs }),
  };
}
