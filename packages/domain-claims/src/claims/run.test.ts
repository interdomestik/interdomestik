import { ambiguous, refused, setup } from './run-dispatch.test-support';
import { describe, expect, it } from 'vitest';
import {
  enqueueNotificationDelivery,
  redriveNotificationDelivery,
} from '@interdomestik/domain-communications/notification-deliveries';
import { delivery, start, timestamp } from './run.test-support';
import {
  claimNotificationDelivery,
  finishNotificationDelivery,
  deliveryFailure,
} from '@interdomestik/domain-communications/notification-deliveries/worker';

describe('delivery state and leases', () => {
  it('leaves early work alone and only claims with enough scheduled time', async () => {
    const row = delivery({ nextAttemptAt: timestamp(start + 1) });
    const h = setup(row);
    expect((await h.schedule()).sent).toBe(0);
    expect(h.queries).toHaveLength(1);
    expect(h.queries[0]).toContain('"notification_deliveries"."next_attempt_at" <= now()');
    h.setClock(start + 1);
    await h.schedule(89_999);
    expect(h.queries).toHaveLength(1);
    expect(row.attempts).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('requeues retryable failure with increasing backoff and fails terminal outcomes', async () => {
    const retry = delivery({ attempts: 2 });
    const terminal = delivery({ id: 'terminal' });
    const h = setup(retry, terminal);
    h.sendEmail
      .mockResolvedValueOnce(ambiguous)
      .mockResolvedValueOnce(deliveryFailure('rejected', false));
    const summary = await h.schedule();
    expect(retry).toMatchObject({
      state: 'queued',
      attempts: 3,
      leaseUntil: null,
      nextAttemptAt: timestamp(start + 3_600_000),
      lastErrorCode: 'timeout',
      transport: 'smtp',
    });
    expect(terminal).toMatchObject({ state: 'failed', lastErrorCode: 'rejected' });
    expect(summary.failures).toEqual([
      { id: retry.id, code: 'timeout' },
      { id: terminal.id, code: 'rejected' },
    ]);
    expect(h.audit).toHaveLength(1);
  });

  it('keeps the eighth provider failure and audits once even when it was a definite refusal', async () => {
    const row = delivery({ attempts: 7 });
    const h = setup(row);
    h.sendEmail.mockResolvedValue(refused);
    expect(await h.schedule()).toMatchObject({ failed: 1 });
    expect(row).toMatchObject({
      state: 'failed',
      attempts: 8,
      lastErrorCode: refused.code,
      transport: null,
    });
    expect(h.sendEmail).toHaveBeenCalledOnce();
    expect(h.audit).toMatchObject([
      { action: 'notification.delivery_failed', metadata: { code: refused.code } },
    ]);
  });

  it('reclaims an expired lease and fences completion by the previous worker', async () => {
    const expired = timestamp(start - 1);
    const row = delivery({ state: 'claimed', attempts: 3, leaseUntil: expired });
    const h = setup(row);
    const old = { ...row, leaseUntil: expired };
    const claim = await claimNotificationDelivery(h.tx, row.tenantId);
    expect(claim).toMatchObject({
      status: 'claimed',
      row: { attempts: 4, leaseUntil: timestamp(start + 600_000) },
    });
    expect(
      await finishNotificationDelivery(h.tx, old, { ok: true, transport: 'smtp' }, 'mk', 'smtp', [
        'smtp',
      ])
    ).toBe('lease_lost');
    expect(row.state).toBe('claimed');
  });

  it('audits expired eighth leases without calling a provider', async () => {
    const row = delivery({ state: 'claimed', attempts: 8, leaseUntil: timestamp(start - 1) });
    const h = setup(row);
    expect(await h.schedule()).toMatchObject({
      failed: 1,
      failures: [{ id: row.id, code: 'lease_expired' }],
    });
    expect(row).toMatchObject({
      state: 'failed',
      leaseUntil: null,
      lastErrorCode: 'lease_expired',
    });
    expect(h.audit).toHaveLength(1);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('deduplicates enqueue and sends once across two concurrent kicks', async () => {
    const h = setup();
    const item = {
      id: 'once',
      tenantId: 'tenant-a',
      claimId: 'claim',
      recipientUserId: 'member',
      kind: 'claim_submitted',
      channel: 'email',
    } as const;
    expect(await enqueueNotificationDelivery(h.tx, item)).toBe('once');
    expect(await enqueueNotificationDelivery(h.tx, { ...item, id: 'duplicate' })).toBeNull();
    await Promise.all([h.kick(['once']), h.kick(['once'])]);
    expect(h.sendEmail).toHaveBeenCalledOnce();
  });

  it('limits both claim branches to the requested kick IDs', async () => {
    const unrelated = delivery({ id: 'early', nextAttemptAt: timestamp(start - 5_000) });
    const row = delivery({ state: 'claimed', attempts: 1, leaseUntil: timestamp(start - 1) });
    const h = setup(unrelated, row);
    expect(await h.kick([row.id])).toMatchObject({ sent: 1 });
    expect(unrelated.attempts).toBe(0);
    expect(h.queries[0]).toMatch(
      /\(\("notification_deliveries"\."state".* or .*\)\) and "notification_deliveries"\."id" in/
    );
  });

  it('lets only one concurrent re-drive update the failed row and retains its pin', async () => {
    const row = delivery({
      state: 'failed',
      attempts: 8,
      transport: 'resend',
      avoidTransport: 'smtp',
      terminalAt: timestamp(start),
      lastErrorCode: 'timeout',
    });
    const h = setup(row);
    const outcomes = await Promise.all([
      redriveNotificationDelivery(h.tx, row.id),
      redriveNotificationDelivery(h.tx, row.id),
    ]);
    expect(outcomes.sort()).toEqual([false, true]);
    expect(row).toMatchObject({
      state: 'queued',
      attempts: 0,
      transport: 'resend',
      avoidTransport: null,
      terminalAt: null,
      lastErrorCode: null,
    });
    expect(h.audit).toMatchObject([{ action: 'notification.delivery_redriven' }]);
  });
});
