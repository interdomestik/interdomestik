import { ambiguous, mocks, refused, setup } from './run-dispatch.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';
import { redriveNotificationDelivery } from '@interdomestik/domain-communications/notification-deliveries';
import { dispatchNotificationDeliveries } from './notification-delivery-runner';
import { delivery, start, timestamp } from './run.test-support';
import {
  claimNotificationDelivery,
  finishNotificationDelivery,
  deliveryFailure,
} from '@interdomestik/domain-communications/notification-deliveries/worker';
import { enqueueNotificationDelivery } from '@interdomestik/domain-communications/notification-deliveries';

describe('delivery state and leases', () => {
  it('leaves early work alone and only claims with enough scheduled time', async () => {
    const row = delivery({ nextAttemptAt: timestamp(start + 1) });
    const h = setup(row);
    expect((await h.schedule()).sent).toBe(0);
    expect(h.queries).toHaveLength(1);
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

  it('refunds a short eighth lease and preserves the previous transport', async () => {
    const row = delivery({ attempts: 7, transport: 'resend' });
    const h = setup(row);
    const lease = timestamp(start + 299_999);
    mocks.prepare.mockImplementationOnce((_tx, owned) => {
      row.leaseUntil = lease;
      owned.leaseUntil = lease;
      return { channel: 'email', locale: 'en' };
    });
    expect(await h.kick()).toMatchObject({ lease_short: 1 });
    expect(row).toMatchObject({
      state: 'queued',
      attempts: 7,
      leaseUntil: null,
      transport: 'resend',
    });
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('refunds after slow preparation or an exhausted call deadline', async () => {
    const row = delivery();
    const h = setup(row);
    mocks.prepare.mockImplementationOnce(() => {
      h.setClock(start + 10_001);
      return { channel: 'email', locale: 'en' };
    });
    expect(await h.kick()).toMatchObject({ budget_short: 1 });
    expect(row).toMatchObject({ state: 'queued', attempts: 0, leaseUntil: null, transport: null });
    h.setWriteDelay(9_001);
    expect(await h.kick()).toMatchObject({ budget_short: 1 });
    expect(row).toMatchObject({ state: 'queued', attempts: 0, leaseUntil: null, transport: null });
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('gives a fresh kick a full call and deducts time spent writing the transport', async () => {
    const early = delivery({ id: 'early' });
    const later = delivery({ id: 'later' });
    const h = setup(early, later);
    await h.kick([early.id]);
    expect(h.sendEmail.mock.calls[0][3]).toMatchObject({ timeoutMs: 10_000 });
    h.setWriteDelay(2_000);
    await h.kick([later.id]);
    expect(h.sendEmail.mock.calls[1][3]).toMatchObject({ timeoutMs: 8_000 });
  });

  it('refunds the attempt when elapsed time runs out during a backward wall-clock adjustment', async () => {
    const row = delivery();
    const h = setup(row);
    const elapsed = vi.spyOn(performance, 'now').mockReturnValue(0);
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(start);
    mocks.prepare.mockImplementationOnce(() => {
      elapsed.mockReturnValue(10_001);
      wallClock.mockReturnValue(start - 30_000);
      return { channel: 'email', locale: 'en' };
    });

    try {
      const result = await dispatchNotificationDeliveries(
        mintTestTenantAuthority(row.tenantId),
        {
          appOrigin: () => 'https://example.test',
          emailTransports: h.emailTransports,
          sendEmail: h.sendEmail,
        },
        { ids: [row.id] }
      );
      expect(result).toMatchObject({ budget_short: 1, sent: 0 });
      expect(row).toMatchObject({ attempts: 0, state: 'queued', transport: null });
      expect(h.sendEmail).not.toHaveBeenCalled();
    } finally {
      elapsed.mockRestore();
      wallClock.mockRestore();
    }
  });

  it('does not call through a lost lease or mark an empty provider answer as sent', async () => {
    const row = delivery();
    const h = setup(row);
    h.loseLeaseAtWrite();
    expect(await h.kick()).toMatchObject({ lease_lost: 1, sent: 0 });
    expect(h.sendEmail).not.toHaveBeenCalled();
    const retry = setup(delivery());
    retry.sendEmail.mockResolvedValue(undefined);
    expect(await retry.kick()).toMatchObject({
      queued: 1,
      sent: 0,
      failures: [{ id: row.id, code: 'provider_failed' }],
    });
  });

  it('skips stale or ineligible rows and retries an eligibility query failure', async () => {
    for (const reason of ['recipient_out_of_scope', 'stale']) {
      const row = delivery();
      const h = setup(row);
      mocks.prepare.mockResolvedValueOnce({ skip: reason });
      expect((await h.kick()).skipped).toBe(1);
      expect(row.skipReason).toBe(reason);
      expect(h.sendEmail).not.toHaveBeenCalled();
    }
    const h = setup(delivery());
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mocks.prepare.mockRejectedValueOnce(
        new Error('private detail', { cause: { code: 'XX000' } })
      );
      expect(await h.kick()).toMatchObject({
        queued: 1,
        failures: [{ code: 'facts_unavailable' }],
      });
      expect(report).toHaveBeenCalledExactlyOnceWith(
        'Notification delivery preparation failed',
        expect.objectContaining({ cause: { name: 'Error', code: 'XX000' } })
      );
      expect(report.mock.calls[0][1]).toBeInstanceOf(Error);
      expect(String(report.mock.calls[0][1])).not.toContain('private detail');
    } finally {
      report.mockRestore();
    }
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
