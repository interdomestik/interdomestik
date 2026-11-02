import { describe, expect, it, vi } from 'vitest';
import { hoisted } from './persist.fixture';
import { insertWebhookEvent, markWebhookFailed, markWebhookProcessed } from './persist';
import { receiptLease, subscriptionCreatedReceipt } from './persist.test-support';

describe('webhook persistence idempotency', () => {
  it('atomically reclaims the exact verified retryable failure', async () => {
    hoisted.admitVerifiedReceipt.mockResolvedValueOnce({
      outcome: 'admitted',
      lease: receiptLease('we_retry'),
      reclaimed: true,
    });
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

    expect(result).toEqual({
      inserted: true,
      webhookEventRowId: 'we_retry',
      receiptLease: receiptLease('we_retry'),
    });
    expect(hoisted.admitVerifiedReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'paddle:entity:mk:event:evt_retry',
        processingScopeKey: 'entity:mk',
        payloadHash: 'hash_retry',
        tenantId: null,
      })
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'webhook.retry_received', entityId: 'we_retry' })
    );
    expect(logAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'webhook.received' })
    );
  });

  it.each(['subscription.created', 'subscription.past_due'])(
    'keeps every exact non-terminal %s entity lease retryable',
    async eventType => {
      hoisted.admitVerifiedReceipt.mockResolvedValueOnce({
        outcome: 'in_progress',
        receiptId: 'we_active',
      });
      const logAuditEvent = vi.fn();

      await expect(
        insertWebhookEvent(
          {
            ...subscriptionCreatedReceipt('active'),
            eventType,
            processingScopeKey: 'entity:mk',
          },
          { logAuditEvent }
        )
      ).rejects.toMatchObject({
        name: 'RetryablePaddleWebhookError',
      });
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'webhook.retry_deferred', entityId: 'we_active' })
      );
    }
  );

  it('distinguishes retryable pre-write failures from permanent processing failures', async () => {
    const retryableLease = receiptLease('we_retryable');
    await markWebhookFailed({
      headers: new Headers(),
      receiptLease: retryableLease,
      eventType: 'subscription.created',
      eventId: 'evt_retryable',
      error: new Error('transaction not ready'),
      retryable: true,
      tenantId: null,
    });
    expect(hoisted.completeReceiptLease).toHaveBeenLastCalledWith(retryableLease, {
      result: 'retryable_error',
      error: 'transaction not ready',
    });

    const permanentLease = receiptLease('we_permanent');
    await markWebhookFailed({
      headers: new Headers(),
      receiptLease: permanentLease,
      eventType: 'subscription.created',
      eventId: 'evt_permanent',
      error: new Error('tenant conflict'),
      retryable: false,
      tenantId: null,
    });
    expect(hoisted.completeReceiptLease).toHaveBeenLastCalledWith(permanentLease, {
      result: 'error',
      error: 'tenant conflict',
    });
  });

  it('completes the admitted lease and audits webhook.processed', async () => {
    const logAuditEvent = vi.fn();
    const lease = receiptLease('we_ok');

    await expect(
      markWebhookProcessed(
        {
          headers: new Headers(),
          receiptLease: lease,
          eventType: 'subscription.created',
          eventId: 'evt_ok',
          tenantId: 'tenant_mk',
        },
        { logAuditEvent }
      )
    ).resolves.toBe(true);

    expect(hoisted.completeReceiptLease).toHaveBeenCalledWith(lease, { result: 'ok' });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webhook.processed',
        entityId: 'we_ok',
        tenantId: 'tenant_mk',
      })
    );
  });

  it('does not audit webhook.processed when the lease was superseded', async () => {
    hoisted.completeReceiptLease.mockResolvedValueOnce(false);
    const logAuditEvent = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      markWebhookProcessed(
        {
          headers: new Headers(),
          receiptLease: receiptLease('we_stale'),
          eventType: 'subscription.created',
          eventId: 'evt_stale',
          tenantId: 'tenant_mk',
        },
        { logAuditEvent }
      )
    ).resolves.toBe(false);

    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[Paddle] Receipt lease was superseded before completion',
      'we_stale'
    );
    warn.mockRestore();
  });

  it('does not audit webhook.failed when the lease was superseded', async () => {
    hoisted.completeReceiptLease.mockResolvedValueOnce(false);
    const logAuditEvent = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      markWebhookFailed(
        {
          headers: new Headers(),
          receiptLease: receiptLease('we_stale_fail'),
          eventType: 'subscription.created',
          eventId: 'evt_stale_fail',
          error: new Error('boom'),
          retryable: true,
          tenantId: 'tenant_mk',
        },
        { logAuditEvent }
      )
    ).resolves.toBe(false);

    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
