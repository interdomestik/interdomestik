import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  insert: vi.fn(),
  insertValues: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    insert: hoisted.insert,
  },
  webhookEvents: {
    id: 'id_col',
    dedupeKey: 'dedupe_key_col',
    processingScopeKey: 'processing_scope_key_col',
    providerTransactionId: 'provider_transaction_id_col',
  },
}));

import { insertWebhookEvent, persistInvalidSignatureAttempt } from './persist';

describe('webhook persistence idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.returning.mockResolvedValue([{ id: 'we_1' }]);
    hoisted.onConflictDoNothing.mockReturnValue({
      returning: hoisted.returning,
    });
    hoisted.insertValues.mockReturnValue({
      onConflictDoNothing: hoisted.onConflictDoNothing,
    });
    hoisted.insert.mockReturnValue({
      values: hoisted.insertValues,
    });
  });

  it('persists invalid signature attempts with scope-aware dedupe and DB conflict no-op', async () => {
    await persistInvalidSignatureAttempt({
      headers: new Headers(),
      processingScopeKey: 'entity:ks',
      dedupeKey: 'paddle:entity:ks:event:evt_1',
      eventType: 'transaction.completed',
      eventId: 'evt_1',
      eventTimestamp: new Date('2026-02-23T00:00:00.000Z'),
      payloadHash: 'hash_1',
      parsedPayload: { ok: true },
      tenantId: 'tenant_ks',
    });

    expect(hoisted.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        processingScopeKey: 'entity:ks',
        dedupeKey: 'paddle:entity:ks:event:evt_1',
      })
    );
    expect(hoisted.onConflictDoNothing).toHaveBeenCalledWith();
  });

  it('returns duplicate=false when DB unique linkage blocks a replayed transaction identity', async () => {
    hoisted.returning.mockResolvedValueOnce([{ id: 'we_tx_1' }]).mockResolvedValueOnce([]);

    const deps = { logAuditEvent: vi.fn() };
    const common = {
      headers: new Headers(),
      processingScopeKey: 'tenant:tenant_ks',
      eventType: 'transaction.completed',
      eventTimestamp: new Date('2026-02-23T00:00:00.000Z'),
      payloadHash: 'hash_tx_1',
      parsedPayload: { data: { id: 'txn_1' } },
      signatureValid: true,
      signatureBypassed: false,
      tenantId: 'tenant_ks',
      providerTransactionId: 'txn_1',
    };

    const first = await insertWebhookEvent(
      {
        ...common,
        dedupeKey: 'paddle:tenant:tenant_ks:event:evt_1',
        eventId: 'evt_1',
      },
      deps
    );

    const replay = await insertWebhookEvent(
      {
        ...common,
        dedupeKey: 'paddle:tenant:tenant_ks:event:evt_2',
        eventId: 'evt_2',
      },
      deps
    );

    expect(first).toEqual({ inserted: true, webhookEventRowId: 'we_tx_1' });
    expect(replay).toEqual({ inserted: false, webhookEventRowId: null });
    expect(hoisted.onConflictDoNothing).toHaveBeenCalledWith();
    expect(deps.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webhook.duplicate',
        metadata: expect.objectContaining({
          processingScopeKey: 'tenant:tenant_ks',
          providerTransactionId: 'txn_1',
        }),
      })
    );
  });
});
