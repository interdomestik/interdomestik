import { beforeEach, vi, type Mock } from 'vitest';

import type { PaddleWebhookAuditDeps, PaddleWebhookDeps, PastDueEmailDeps } from '../types';
import { projectLockedSubscriptionOrder } from './provider-event-order.test-support';

type StoredRow = {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  providerSubscriptionId: string;
  providerEventOccurredAt: string | null;
  providerEventId: string | null;
  dunningAttemptCount: number | null;
  pastDueAt: Date | null;
  gracePeriodEndsAt: Date | null;
};

// Fake row store: `FOR UPDATE` holds a per-row lock until the transaction ends and
// staged writes become visible only on commit, as in Postgres.
const hoisted = vi.hoisted(() => {
  const subscriptions = {
    id: 'subscriptions.id',
    tenantId: 'subscriptions.tenant_id',
    userId: 'subscriptions.user_id',
    status: 'subscriptions.status',
    providerSubscriptionId: 'subscriptions.provider_subscription_id',
    providerEventId: 'subscriptions.provider_event_id',
    providerEventOccurredAt: 'subscriptions.provider_event_occurred_at',
    dunningAttemptCount: 'subscriptions.dunning_attempt_count',
    pastDueAt: 'subscriptions.past_due_at',
    gracePeriodEndsAt: 'subscriptions.grace_period_ends_at',
  };
  const auditLog = { id: 'audit.id' };
  const engagementEmailSends = {
    tenantId: 'delivery.tenantId',
    subscriptionId: 'delivery.subscriptionId',
    dedupeKey: 'delivery.dedupeKey',
    templateKey: 'delivery.templateKey',
  };
  type Delivery = Record<string, any>;
  const store = {
    row: null as StoredRow | null,
    lock: Promise.resolve(),
    audits: [] as Delivery[],
    deliveries: [] as Delivery[],
    crashAfterCommit: false,
    failAudit: false,
    failIntent: false,
    failAck: false,
  };

  async function transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
    let release = () => {};
    let staged: StoredRow | undefined;
    let audits = store.audits;
    let deliveries = store.deliveries;
    const matches = (row: Delivery, condition: any): boolean =>
      condition.op === 'and'
        ? condition.conditions.every((item: any) => matches(row, item))
        : row[condition.left.split('.').at(-1)] === condition.right;
    const tx = {
      select: (shape: Record<string, unknown> = {}) => ({
        from: (table: unknown) => ({
          where: (condition: any) => {
            if (table === engagementEmailSends) {
              return { for: async () => deliveries.filter(row => matches(row, condition)) };
            }
            if (table !== subscriptions) {
              return Promise.resolve([{ hasInvalid: null, hasNewer: null, hasEqual: null }]);
            }
            if ('comparison' in shape) {
              return {
                for: async () => {
                  const previous = store.lock;
                  store.lock = new Promise<void>(resolve => (release = resolve));
                  await previous;
                  audits = store.audits;
                  deliveries = store.deliveries;
                  return store.row
                    ? [projectLockedSubscriptionOrder(store.row, shape.comparison)]
                    : [];
                },
              };
            }
            return Promise.resolve(store.row ? [{ ...store.row }] : []);
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: async (values: Delivery) => {
          if (table === auditLog) {
            if (store.failAudit) throw new Error('injected audit outage');
            audits = [...audits, values];
          } else if (store.failIntent) throw new Error('injected intent outage');
          else deliveries = [...deliveries, { createdAt: new Date(), ...values }];
        },
      }),
      update: (table: unknown) => ({
        set: (values: Partial<StoredRow>) => ({
          where: (condition: any) => {
            if (table === engagementEmailSends) {
              if (store.failAck) throw new Error('injected ack failure');
              deliveries = deliveries.map(row =>
                matches(row, condition) ? { ...row, ...values } : row
              );
              return Promise.resolve();
            }
            return {
              returning: async () => {
                staged = { ...store.row!, ...values };
                return [{ id: store.row!.id }];
              },
            };
          },
        }),
      }),
    };
    try {
      const result = await callback(tx);
      if (staged) store.row = staged;
      store.audits = audits;
      store.deliveries = deliveries;
      if (staged && store.crashAfterCommit) {
        store.crashAfterCommit = false;
        throw new Error('injected post-commit crash');
      }
      return result;
    } finally {
      release();
    }
  }

  return {
    subscriptions,
    auditLog,
    engagementEmailSends,
    store,
    withTenantContext: vi.fn((_context, callback) => transaction(callback)) as Mock,
    and: (...conditions: unknown[]) => ({ op: 'and', conditions }),
    eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
    inArray: (left: unknown, right: unknown) => ({ op: 'inArray', left, right }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    db: {
      transaction: vi.fn(transaction) as Mock<typeof transaction>,
      insert: vi.fn() as Mock,
      update: vi.fn() as Mock,
      query: {
        user: { findFirst: vi.fn() as Mock },
        subscriptions: { findFirst: vi.fn() as Mock },
      },
    },
    findSubscriptionByProviderReference: vi.fn() as Mock,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  db: hoisted.db,
  withTenantContext: hoisted.withTenantContext,
  domainEvents: { id: 'domain_events.id', tenantId: 'domain_events.tenant_id' },
  eq: hoisted.eq,
  inArray: hoisted.inArray,
  sql: hoisted.sql,
  subscriptions: hoisted.subscriptions,
  webhookEvents: { payload: 'webhook_events.payload' },
}));
vi.mock('@interdomestik/database/schema', () => ({
  auditLog: hoisted.auditLog,
  engagementEmailSends: hoisted.engagementEmailSends,
}));
vi.mock('../../subscription', () => ({
  findSubscriptionByProviderReference: hoisted.findSubscriptionByProviderReference,
}));
vi.mock('../../annual-membership', () => ({
  createCanonicalMembershipPlanState: (planId: string, planKey?: string | null) => ({
    planId,
    ...(planKey ? { planKey } : {}),
  }),
  resolveCanonicalMembershipPlanState: vi.fn(async () => ({ planId: 'standard', planKey: null })),
}));

export function seed(status: string, markerAt: string, markerEventId: string) {
  hoisted.store.row = {
    id: 'sub_1',
    tenantId: 'tenant_ks',
    userId: 'user_1',
    status,
    providerSubscriptionId: 'sub_1',
    providerEventOccurredAt: markerAt,
    providerEventId: markerEventId,
    dunningAttemptCount: 0,
    pastDueAt: null,
    gracePeriodEndsAt: null,
  };
}

export let deps: Required<Pick<PaddleWebhookDeps, 'sendPaymentFailedEmail'>> &
  Required<PaddleWebhookAuditDeps> &
  Required<PastDueEmailDeps>;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.store.lock = Promise.resolve();
  hoisted.store.audits = [];
  hoisted.store.deliveries = [];
  hoisted.store.crashAfterCommit = false;
  hoisted.store.failAudit = false;
  hoisted.store.failIntent = false;
  hoisted.store.failAck = false;
  hoisted.findSubscriptionByProviderReference.mockImplementation(async () =>
    hoisted.store.row ? { ...hoisted.store.row } : null
  );
  hoisted.db.query.user.findFirst.mockResolvedValue({
    id: 'user_1',
    email: 'member@example.com',
    name: 'Member',
    tenantId: 'tenant_ks',
  });
  deps = {
    logAuditEvent: vi.fn() as Mock,
    preparePastDueEmail: vi.fn((to, params) => ({
      from: 'support@example.com',
      to,
      subject: params.planName,
      html: '<p>Payment failed</p>',
      text: params.gracePeriodEndDate,
    })),
    sendPreparedPastDueEmail: vi.fn().mockResolvedValue({ success: true, id: 'email-1' }),
    sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  };
});

export { hoisted };
