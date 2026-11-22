import { mocks, setup } from './run-dispatch.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';
import { deliveryFailure } from '@interdomestik/domain-communications/notification-deliveries/worker';
import { dispatchNotificationDeliveries } from './notification-delivery-runner';
import { delivery, start, timestamp } from './run.test-support';

describe('delivery send boundary', () => {
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

  it.each([1_000, 10_001])(
    'skips a row that expires before the transport write after %d ms spent preparing',
    async delay => {
      const row = delivery({ createdAt: timestamp(start - 259_200_000 + 1_000) });
      const h = setup(row);
      mocks.prepare.mockImplementationOnce(() => {
        h.setClock(start + delay);
        return { channel: 'email', locale: 'en' };
      });

      expect(await h.kick()).toMatchObject({ skipped: 1, sent: 0 });
      expect(row).toMatchObject({ state: 'skipped', skipReason: 'stale', transport: null });
      expect(h.sendEmail).not.toHaveBeenCalled();
    }
  );

  it.each([null, 'smtp'] as const)(
    'skips a row that expires after the transport write, preserving its original transport %s',
    async transport => {
      const row = delivery({ createdAt: timestamp(start - 259_200_000 + 1_000), transport });
      const h = setup(row);
      h.setWriteCommitDelay(1_000);

      expect(await h.kick()).toMatchObject({ skipped: 1, sent: 0 });
      expect(row).toMatchObject({ state: 'skipped', skipReason: 'stale', transport });
      expect(h.sendEmail).not.toHaveBeenCalled();
    }
  );

  it('refunds a provisional stale decision while the database still considers the row live', async () => {
    const row = delivery({ attempts: 7, createdAt: timestamp(start - 259_200_000 + 3_000) });
    const h = setup(row);
    h.setWriteQueryDelay(2_000);

    expect(await h.kick()).toMatchObject({ queued: 1, skipped: 0, sent: 0 });
    expect(row).toMatchObject({
      state: 'queued',
      attempts: 7,
      leaseUntil: null,
      skipReason: null,
      terminalAt: null,
      transport: null,
    });
    expect(h.sendEmail).not.toHaveBeenCalled();
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

  it('retires only the push subscription version used for a gone response', async () => {
    const row = delivery({ channel: 'push', pushSubscriptionId: 'subscription' });
    const h = setup(row);
    h.sendPush.mockResolvedValue(deliveryFailure('subscription_gone', false));

    expect(await h.kick()).toMatchObject({ failed: 1, failures: [{ code: 'subscription_gone' }] });
    expect(h.deletedSubscriptions).toMatchObject([
      {
        sql: expect.stringContaining('"push_subscriptions"."xmin"::text = $4'),
        params: [row.tenantId, row.recipientUserId, row.pushSubscriptionId, '4711'],
      },
    ]);
  });

  it('skips stale or ineligible rows and retries an eligibility query failure', async () => {
    for (const reason of ['recipient_out_of_scope', 'stale']) {
      const row = delivery(reason === 'stale' ? { createdAt: timestamp(start - 259_200_000) } : {});
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
});
