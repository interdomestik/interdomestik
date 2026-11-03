import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { describe, expect, it, vi } from 'vitest';
import { hoisted } from './persist.fixture';
import { insertWebhookEvent, persistInvalidSignatureAttempt } from './persist';
import { receiptLease, subscriptionCreatedReceipt } from './persist.test-support';

const ksAuthority = mintTestTenantAuthority('tenant_ks');

describe('webhook persistence idempotency', () => {
  it('persists invalid signature attempts as tenant-less evidence in the caller scope', async () => {
    await persistInvalidSignatureAttempt({
      headers: new Headers(),
      processingScopeKey: 'entity:ks',
      dedupeKey: 'paddle:entity:ks:event:evt_1',
      eventType: 'transaction.completed',
      eventId: 'evt_1',
      eventTimestamp: new Date('2026-02-23T00:00:00.000Z'),
      payloadHash: 'hash_1',
      parsedPayload: { ok: true },
    });

    expect(hoisted.appendInvalidSignatureEvidence).toHaveBeenCalledTimes(1);
    const [evidence] = hoisted.appendInvalidSignatureEvidence.mock.calls[0]!;
    expect(evidence).toEqual({
      processingScopeKey: 'entity:ks',
      dedupeKey: 'paddle:entity:ks:event:evt_1',
      eventType: 'transaction.completed',
      eventId: 'evt_1',
      eventTimestamp: new Date('2026-02-23T00:00:00.000Z'),
      payloadHash: 'hash_1',
      payload: { ok: true },
    });
    // Unverified evidence never carries a tenant and is never admitted as a genuine receipt.
    expect(evidence).not.toHaveProperty('tenantId');
    expect(hoisted.admitVerifiedReceipt).not.toHaveBeenCalled();
  });

  it('never forwards a tenant for invalid signatures even when the scope is unsafe', async () => {
    await persistInvalidSignatureAttempt({
      headers: new Headers(),
      processingScopeKey: 'entity:unknown',
      dedupeKey: 'paddle:entity:unknown:hash:hash_unsafe',
      eventType: 'transaction.completed',
      eventId: undefined,
      eventTimestamp: null,
      payloadHash: 'hash_unsafe',
      parsedPayload: { ok: false },
    });

    const [evidence] = hoisted.appendInvalidSignatureEvidence.mock.calls[0]!;
    expect(evidence).toEqual(
      expect.objectContaining({ processingScopeKey: 'entity:unknown', eventId: null })
    );
    expect(evidence).not.toHaveProperty('tenantId');
  });

  it('returns duplicate=false when DB unique linkage blocks a replayed transaction identity', async () => {
    hoisted.admitVerifiedReceipt
      .mockResolvedValueOnce({
        outcome: 'admitted',
        lease: receiptLease('we_tx_1'),
        reclaimed: false,
      })
      .mockResolvedValueOnce({ outcome: 'duplicate' });

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
      authority: ksAuthority,
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

    expect(first).toEqual({
      inserted: true,
      webhookEventRowId: 'we_tx_1',
      receiptLease: receiptLease('we_tx_1'),
    });
    expect(replay).toEqual({ inserted: false, webhookEventRowId: null });
    expect(
      deps.logAuditEvent.mock.calls.map(([audit]) => [
        audit.action,
        audit.entityId,
        readTenantAuthority(audit.authority).tenantId,
      ])
    ).toEqual([
      ['webhook.received', 'we_tx_1', 'tenant_ks'],
      ['webhook.duplicate', undefined, 'tenant_ks'],
    ]);
  });

  it('records no tenant-scoped audit for a duplicate when no tenant authority was resolved', async () => {
    hoisted.admitVerifiedReceipt.mockResolvedValueOnce({ outcome: 'duplicate' });
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
    expect(hoisted.admitVerifiedReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null, providerTransactionId: 'txn_dup' })
    );
    // No tenant was resolved, so there is no tenant to record the audit row in.
    expect(deps.logAuditEvent).not.toHaveBeenCalled();
  });

  it('admits bypassed signatures but never an unverified receipt', async () => {
    await insertWebhookEvent({
      ...subscriptionCreatedReceipt('bypass'),
      signatureValid: false,
      signatureBypassed: true,
    });
    expect(hoisted.admitVerifiedReceipt).toHaveBeenCalledTimes(1);
  });

  it('throws before any admission when the signature is neither valid nor bypassed', async () => {
    const logAuditEvent = vi.fn();

    await expect(
      insertWebhookEvent(
        {
          ...subscriptionCreatedReceipt('unverified'),
          signatureValid: false,
          signatureBypassed: false,
        },
        { logAuditEvent }
      )
    ).rejects.toThrow('Unverified Paddle webhook cannot be admitted as a receipt');

    expect(hoisted.admitVerifiedReceipt).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
