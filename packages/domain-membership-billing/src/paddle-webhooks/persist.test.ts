import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'and' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, op: 'eq', right })),
  isNull: vi.fn(value => ({ op: 'isNull', value })),
  lt: vi.fn((left: unknown, right: unknown) => ({ left, op: 'lt', right })),
  or: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'or' })),
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  findFirst: vi.fn(),
  onConflictDoNothing: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  updateReturning: vi.fn(),
  where: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  isNull: hoisted.isNull,
  lt: hoisted.lt,
  or: hoisted.or,
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    insert: hoisted.insert,
    query: {
      webhookEvents: {
        findFirst: hoisted.findFirst,
      },
    },
    update: hoisted.update,
  },
  webhookEvents: {
    id: 'id_col',
    dedupeKey: 'dedupe_key_col',
    error: 'error_col',
    eventType: 'event_type_col',
    payloadHash: 'payload_hash_col',
    processedAt: 'processed_at_col',
    processingResult: 'processing_result_col',
    processingScopeKey: 'processing_scope_key_col',
    providerTransactionId: 'provider_transaction_id_col',
    signatureValid: 'signature_valid_col',
    receivedAt: 'received_at_col',
  },
}));

import { insertWebhookEvent, markWebhookFailed, persistInvalidSignatureAttempt } from './persist';
import { subscriptionCreatedReceipt } from './persist.test-support';

describe('webhook persistence idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.findFirst.mockResolvedValue(undefined);
    hoisted.insertReturning.mockResolvedValue([{ id: 'we_1' }]);
    hoisted.updateReturning.mockResolvedValue([]);
    hoisted.onConflictDoNothing.mockReturnValue({
      returning: hoisted.insertReturning,
    });
    hoisted.insertValues.mockReturnValue({
      onConflictDoNothing: hoisted.onConflictDoNothing,
    });
    hoisted.insert.mockReturnValue({
      values: hoisted.insertValues,
    });
    hoisted.where.mockReturnValue({ returning: hoisted.updateReturning });
    hoisted.set.mockReturnValue({ where: hoisted.where });
    hoisted.update.mockReturnValue({ set: hoisted.set });
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
  it('preserves nullable tenant persistence for invalid signatures when tenant is unsafe', async () => {
    await persistInvalidSignatureAttempt({
      headers: new Headers(),
      processingScopeKey: 'entity:unknown',
      dedupeKey: 'paddle:entity:unknown:hash:hash_unsafe',
      eventType: 'transaction.completed',
      eventId: undefined,
      eventTimestamp: null,
      payloadHash: 'hash_unsafe',
      parsedPayload: { ok: false },
      tenantId: null,
    });

    expect(hoisted.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: null,
        processingScopeKey: 'entity:unknown',
      })
    );
  });
  it('returns duplicate=false when DB unique linkage blocks a replayed transaction identity', async () => {
    hoisted.insertReturning.mockResolvedValueOnce([{ id: 'we_tx_1' }]).mockResolvedValueOnce([]);

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
        action: 'webhook.received',
        entityId: 'we_tx_1',
        tenantId: 'tenant_ks',
      })
    );
    expect(deps.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webhook.duplicate',
        tenantId: 'tenant_ks',
        metadata: expect.objectContaining({
          processingScopeKey: 'tenant:tenant_ks',
          providerTransactionId: 'txn_1',
        }),
      })
    );
  });

  it('preserves duplicate webhook audit behavior when tenantId is nullable', async () => {
    hoisted.insertReturning.mockResolvedValueOnce([]);
    const deps = { logAuditEvent: vi.fn() };

    const result = await insertWebhookEvent(
      {
        headers: new Headers(),
        processingScopeKey: 'entity:unknown',
        dedupeKey: 'paddle:entity:unknown:event:evt_dup',
        eventType: 'transaction.completed',
        eventId: 'evt_dup',
        eventTimestamp: new Date('2026-02-23T00:00:00.000Z'),
        payloadHash: 'hash_dup',
        parsedPayload: { data: { id: 'txn_dup' } },
        signatureValid: true,
        signatureBypassed: false,
        tenantId: null,
        providerTransactionId: 'txn_dup',
      },
      deps
    );

    expect(result).toEqual({ inserted: false, webhookEventRowId: null });
    expect(hoisted.insertValues).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null }));
    expect(deps.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webhook.duplicate',
        tenantId: undefined,
        metadata: expect.objectContaining({
          processingScopeKey: 'entity:unknown',
          providerTransactionId: 'txn_dup',
        }),
      })
    );
  });

  it('atomically reclaims the exact verified retryable failure', async () => {
    hoisted.insertReturning.mockResolvedValueOnce([]);
    hoisted.updateReturning.mockResolvedValueOnce([{ id: 'we_retry' }]);
    const logAuditEvent = vi.fn();

    const result = await insertWebhookEvent(
      {
        ...subscriptionCreatedReceipt('retry'),
        processingScopeKey: 'entity:mk',
        dedupeKey: 'paddle:entity:mk:event:evt_retry',
        tenantId: null,
      },
      { logAuditEvent }
    );

    expect(result).toEqual({ inserted: true, webhookEventRowId: 'we_retry' });
    expect(hoisted.set).toHaveBeenCalledWith({
      receivedAt: expect.any(Date),
      processedAt: null,
      processingResult: null,
      error: null,
    });
    expect(hoisted.eq).toHaveBeenCalledWith('dedupe_key_col', 'paddle:entity:mk:event:evt_retry');
    expect(hoisted.eq).toHaveBeenCalledWith('processing_scope_key_col', 'entity:mk');
    expect(hoisted.eq).toHaveBeenCalledWith('payload_hash_col', 'hash_retry');
    expect(hoisted.eq).toHaveBeenCalledWith('signature_valid_col', true);
    expect(hoisted.eq).toHaveBeenCalledWith('processing_result_col', 'retryable_error');
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'webhook.retry_received', entityId: 'we_retry' })
    );
  });

  it('atomically reclaims a stale verified subscription-created processing lease', async () => {
    hoisted.insertReturning.mockResolvedValueOnce([]);
    hoisted.updateReturning.mockResolvedValueOnce([{ id: 'we_stale' }]);

    const result = await insertWebhookEvent(subscriptionCreatedReceipt('stale'));

    expect(result).toEqual({ inserted: true, webhookEventRowId: 'we_stale' });
    expect(hoisted.isNull).toHaveBeenCalledWith('processing_result_col');
    expect(hoisted.lt).toHaveBeenCalledWith('received_at_col', expect.any(Date));
    expect(hoisted.eq).toHaveBeenCalledWith('event_type_col', 'subscription.created');
  });

  it('keeps every exact non-terminal subscription-created lease retryable', async () => {
    hoisted.insertReturning.mockResolvedValueOnce([]);
    hoisted.updateReturning.mockResolvedValueOnce([]);
    hoisted.findFirst.mockImplementationOnce(query => {
      const queryEq = vi.fn();
      query.where(
        {
          provider: 'provider_col',
          processingScopeKey: 'processing_scope_key_col',
          dedupeKey: 'dedupe_key_col',
          eventType: 'event_type_col',
          payloadHash: 'payload_hash_col',
          signatureValid: 'signature_valid_col',
          processingResult: 'processing_result_col',
        },
        { and: vi.fn(), eq: queryEq, isNull: vi.fn(), or: vi.fn() }
      );
      expect(queryEq).toHaveBeenCalledWith('processing_result_col', 'retryable_error');
      return { id: 'we_active' };
    });

    await expect(insertWebhookEvent(subscriptionCreatedReceipt('active'))).rejects.toMatchObject({
      name: 'RetryablePaddleWebhookError',
    });
  });

  it('distinguishes retryable pre-write failures from permanent processing failures', async () => {
    await markWebhookFailed({
      headers: new Headers(),
      webhookEventRowId: 'we_retryable',
      eventType: 'subscription.created',
      eventId: 'evt_retryable',
      error: new Error('transaction not ready'),
      retryable: true,
      tenantId: null,
    });
    expect(hoisted.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ processingResult: 'retryable_error' })
    );

    await markWebhookFailed({
      headers: new Headers(),
      webhookEventRowId: 'we_permanent',
      eventType: 'subscription.created',
      eventId: 'evt_permanent',
      error: new Error('tenant conflict'),
      retryable: false,
      tenantId: null,
    });
    expect(hoisted.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ processingResult: 'error' })
    );
  });
});
