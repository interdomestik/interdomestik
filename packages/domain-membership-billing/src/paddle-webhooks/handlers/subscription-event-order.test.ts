import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  inArray: vi.fn((left: unknown, right: unknown) => ({ op: 'inArray', left, right })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    text: strings.join('?'),
    values,
  })),
}));

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  domainEvents: { id: 'domain_events.id', tenantId: 'domain_events.tenant_id' },
  eq: hoisted.eq,
  inArray: hoisted.inArray,
  sql: hoisted.sql,
  subscriptions: {
    id: 'subscriptions.id',
    tenantId: 'subscriptions.tenant_id',
    status: 'subscriptions.status',
    providerSubscriptionId: 'subscriptions.provider_subscription_id',
    providerEventId: 'subscriptions.provider_event_id',
    providerEventOccurredAt: 'subscriptions.provider_event_occurred_at',
  },
  webhookEvents: {
    provider: 'webhook_events.provider',
    processingScopeKey: 'webhook_events.processing_scope_key',
    tenantId: 'webhook_events.tenant_id',
    signatureValid: 'webhook_events.signature_valid',
    eventType: 'webhook_events.event_type',
    eventId: 'webhook_events.event_id',
    payload: 'webhook_events.payload',
    processingResult: 'webhook_events.processing_result',
  },
}));

import { PaddleEventOrderingError } from '../errors';
import { lockSubscriptionEventOrder } from './subscription-event-order';

type LockedRow = {
  status: string;
  providerSubscriptionId: string | null;
  providerEventId: string | null;
  comparison: 'newer' | 'equal' | 'older' | null;
};

const ORDER = {
  occurredAt: '2026-09-26T10:00:00.000002Z',
  providerEventId: 'evt_incoming',
  processingScopeKey: 'entity:ks',
};
const LOCK_ARGS = {
  domainEventId: 'paddle:tenant_ks:evt_incoming:subscription-changed',
  order: ORDER,
  providerSubscriptionId: 'sub_1',
  subscriptionId: 'sub_1',
  tenantId: 'tenant_ks',
};

function scriptedTx(script: {
  row?: LockedRow;
  ledger?: { hasInvalid: boolean | null; hasNewer: boolean | null; hasEqual: boolean | null };
  recorded?: boolean;
}) {
  const calls = { lockWhere: [] as unknown[], ledgerWhere: [] as unknown[], forUpdate: 0 };
  const tx = {
    select: vi.fn(() => ({
      from: (table: Record<string, string>) => ({
        where: (condition: unknown) => {
          if (table.providerEventOccurredAt) {
            calls.lockWhere.push(condition);
            return {
              for: async (mode: string) => {
                expect(mode).toBe('update');
                calls.forUpdate += 1;
                return script.row ? [script.row] : [];
              },
            };
          }
          if (table.payload) {
            calls.ledgerWhere.push(condition);
            return Promise.resolve([
              script.ledger ?? { hasInvalid: null, hasNewer: null, hasEqual: null },
            ]);
          }
          return { limit: async () => (script.recorded ? [{ id: LOCK_ARGS.domainEventId }] : []) };
        },
      }),
    })),
  };
  return { tx: tx as never, calls };
}

function row(overrides: Partial<LockedRow> = {}): LockedRow {
  return {
    status: 'active',
    providerSubscriptionId: 'sub_1',
    providerEventId: 'evt_marker',
    comparison: 'newer',
    ...overrides,
  };
}

function fragmentText(value: unknown): string {
  return JSON.stringify(value);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lockSubscriptionEventOrder', () => {
  it('locks the exact tenant-scoped row and applies a newer event', async () => {
    const { tx, calls } = scriptedTx({ row: row({ status: 'past_due' }) });

    await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).resolves.toEqual({
      kind: 'apply',
      fromStatus: 'past_due',
    });
    expect(calls.forUpdate).toBe(1);
    expect(calls.lockWhere[0]).toEqual({
      op: 'and',
      conditions: [
        { op: 'eq', left: 'subscriptions.id', right: 'sub_1' },
        { op: 'eq', left: 'subscriptions.tenant_id', right: 'tenant_ks' },
      ],
    });
    expect(calls.ledgerWhere).toHaveLength(0);
  });

  it('compares the incoming occurred_at in SQL at microsecond precision', async () => {
    const { tx } = scriptedTx({ row: row() });

    await lockSubscriptionEventOrder(tx, LOCK_ARGS);

    const comparison = (tx as unknown as { select: ReturnType<typeof vi.fn> }).select.mock
      .calls[0]![0].comparison;
    expect(fragmentText(comparison)).toContain('"values":["2026-09-26T10:00:00.000002Z"]');
    expect(fragmentText(comparison)).toContain('::timestamptz');
  });

  it('treats an older event after a newer snapshot as a stale no-op', async () => {
    const { tx } = scriptedTx({ row: row({ comparison: 'older' }), recorded: false });

    await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).resolves.toEqual({ kind: 'stale' });
  });

  it('treats an older event whose own snapshot already committed as a replay', async () => {
    const { tx } = scriptedTx({ row: row({ comparison: 'older' }), recorded: true });

    await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).resolves.toEqual({ kind: 'replayed' });
  });

  it('treats the exact marker event as an idempotent replay', async () => {
    const { tx } = scriptedTx({
      row: row({ comparison: 'equal', providerEventId: 'evt_incoming' }),
    });

    await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).resolves.toEqual({ kind: 'replayed' });
  });

  it('rejects a distinct event at an equal occurred_at without choosing a winner', async () => {
    const { tx } = scriptedTx({ row: row({ comparison: 'equal', providerEventId: 'evt_other' }) });

    await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).rejects.toThrow(
      PaddleEventOrderingError
    );
  });

  it('never compares a marker that belongs to another provider subscription', async () => {
    const { tx, calls } = scriptedTx({
      row: row({ providerSubscriptionId: 'sub_previous', comparison: 'older' }),
    });

    await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).resolves.toEqual({
      kind: 'apply',
      fromStatus: 'active',
    });
    expect(calls.ledgerWhere).toHaveLength(0);
  });

  it('refuses another provider subscription when the exact aggregate is required', async () => {
    const { tx } = scriptedTx({
      row: row({ providerSubscriptionId: 'sub_previous', comparison: 'newer' }),
    });

    await expect(
      lockSubscriptionEventOrder(tx, { ...LOCK_ARGS, requireExactAggregate: true })
    ).rejects.toThrow('Provider order integrity failed');
  });

  it('treats an older event without a replay identity as stale', async () => {
    const { tx } = scriptedTx({ row: row({ comparison: 'older' }), recorded: true });
    const withoutReplayIdentity = {
      order: ORDER,
      providerSubscriptionId: 'sub_1',
      subscriptionId: 'sub_1',
      tenantId: 'tenant_ks',
    };

    await expect(lockSubscriptionEventOrder(tx, withoutReplayIdentity)).resolves.toEqual({
      kind: 'stale',
    });
  });

  it('fails when no tenant-scoped row can be locked', async () => {
    const { tx } = scriptedTx({});

    await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).rejects.toThrow(
      'update matched no tenant-scoped row'
    );
  });

  describe('pre-existing rows without a marker', () => {
    const unmarked = () => row({ comparison: null, providerEventId: null });

    it('derives the floor from same-scope, same-tenant receipts of the aggregate', async () => {
      const { tx, calls } = scriptedTx({ row: unmarked() });

      await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).resolves.toEqual({
        kind: 'apply',
        fromStatus: 'active',
      });
      const where = fragmentText(calls.ledgerWhere[0]);
      expect(where).toContain('"left":"webhook_events.processing_scope_key","right":"entity:ks"');
      expect(where).toContain('"left":"webhook_events.tenant_id","right":"tenant_ks"');
      expect(where).toContain('"left":"webhook_events.signature_valid","right":true');
      expect(where).toContain("-> 'data' ->> 'id' = ?");
      expect(where).toContain('"sub_1"');
      expect(where).toContain('is distinct from ?');
      expect(where).toContain('"evt_incoming"');
    });

    it('does not let an older event overwrite a newer pre-deployment snapshot', async () => {
      const { tx } = scriptedTx({
        row: unmarked(),
        ledger: { hasInvalid: false, hasNewer: true, hasEqual: false },
        recorded: false,
      });

      await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).resolves.toEqual({ kind: 'stale' });
    });

    it('fails closed when a verified receipt has no usable ordering evidence', async () => {
      const { tx } = scriptedTx({
        row: unmarked(),
        ledger: { hasInvalid: true, hasNewer: false, hasEqual: false },
      });

      await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).rejects.toThrow(
        PaddleEventOrderingError
      );
    });

    it('fails closed when a distinct receipt shares the occurred_at', async () => {
      const { tx } = scriptedTx({
        row: unmarked(),
        ledger: { hasInvalid: false, hasNewer: false, hasEqual: true },
      });

      await expect(lockSubscriptionEventOrder(tx, LOCK_ARGS)).rejects.toThrow(
        PaddleEventOrderingError
      );
    });
  });
});
