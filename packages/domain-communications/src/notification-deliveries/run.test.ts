import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redriveNotificationDelivery } from './failed';
import { delivery, harness, start, timestamp } from './run.test-support';
import {
  claimNotificationDelivery,
  enqueueNotificationDelivery,
  finishNotificationDelivery,
} from './store';
import { deliveryFailure } from './transport';

const mocks = vi.hoisted(() => ({ withAuthority: vi.fn(), prepare: vi.fn() }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.withAuthority,
}));
vi.mock('./prepare', () => ({ prepareNotificationDelivery: mocks.prepare }));

const setup = (...rows: ReturnType<typeof delivery>[]) =>
  harness(mocks.withAuthority, mocks.prepare, rows);
const refused = { ...deliveryFailure('smtp_pre_acceptance', true), preAcceptance: true };
const ambiguous = { ...deliveryFailure('timeout', true), ambiguous: true };

beforeEach(() => vi.resetAllMocks());

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
    mocks.prepare.mockRejectedValueOnce(new Error('private detail'));
    expect(await h.kick()).toMatchObject({ queued: 1, failures: [{ code: 'facts_unavailable' }] });
  });

  it('redrives only a failed row, retaining its pin and auditing once', async () => {
    const row = delivery({
      state: 'failed',
      attempts: 8,
      transport: 'resend',
      avoidTransport: 'smtp',
      terminalAt: timestamp(start),
      lastErrorCode: 'timeout',
    });
    const h = setup(row);
    expect(await redriveNotificationDelivery(h.tx, row.id)).toBe(true);
    expect(await redriveNotificationDelivery(h.tx, row.id)).toBe(false);
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

describe('transport selection', () => {
  it('switches after definite refusal, then keeps an ambiguous Resend attempt on Resend with the same key', async () => {
    const row = delivery();
    const h = setup(row);
    h.sendEmail.mockResolvedValueOnce(refused).mockResolvedValueOnce(ambiguous);
    await h.kick();
    expect(row).toMatchObject({
      transport: 'resend',
      avoidTransport: 'smtp',
      attempts: 2,
      state: 'queued',
    });
    h.setClock(Date.parse(row.nextAttemptAt));
    await h.kick();
    expect(row).toMatchObject({ state: 'sent', avoidTransport: null });
    expect(h.sendEmail.mock.calls.map(call => [call[0], call[3].idempotencyKey])).toEqual([
      ['smtp', row.id],
      ['resend', row.id],
      ['resend', row.id],
    ]);
  });

  it('backs off after both refusing and never spends a third immediate attempt', async () => {
    const row = delivery();
    const h = setup(row);
    h.sendEmail.mockResolvedValue(refused);
    await h.kick();
    expect(h.sendEmail.mock.calls.map(call => call[0])).toEqual(['smtp', 'resend']);
    expect(row).toMatchObject({
      state: 'queued',
      attempts: 2,
      transport: null,
      avoidTransport: 'resend',
      nextAttemptAt: timestamp(start + 1_800_000),
    });
  });

  it('keeps SMTP pinned on uncertainty and fails if the pin becomes unavailable', async () => {
    const row = delivery();
    const h = setup(row);
    h.sendEmail.mockResolvedValue(ambiguous);
    await h.kick();
    h.setClock(Date.parse(row.nextAttemptAt));
    await h.kick();
    expect(h.sendEmail.mock.calls.map(call => call[0])).toEqual(['smtp', 'smtp']);
    h.emailTransports.mockReturnValue(['resend']);
    h.setClock(Date.parse(row.nextAttemptAt));
    expect(await h.kick()).toMatchObject({
      failed: 1,
      failures: [{ code: 'transport_unavailable' }],
    });
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['smtp', 'smtp'],
    ['resend', 'smtp'],
  ] as const)(
    'starts on %s when configured alone, then uses %s after a definite refusal',
    async (first, second) => {
      const row = delivery();
      const h = setup(row);
      h.emailTransports.mockReturnValue([first]);
      h.sendEmail.mockResolvedValueOnce(refused);
      await h.kick();
      expect(row.transport).toBeNull();
      h.emailTransports.mockReturnValue([second]);
      h.setClock(Date.parse(row.nextAttemptAt));
      await h.kick();
      expect(row.state).toBe('sent');
      expect(h.sendEmail.mock.calls.map(call => call[0])).toEqual([first, second]);
    }
  );

  it('uses Resend immediately after a late SMTP envelope refusal with a 550', async () => {
    const row = delivery();
    const h = setup(row);
    h.sendEmail.mockResolvedValueOnce({ ...refused, retryable: false });
    await h.kick();
    expect(row.state).toBe('sent');
    expect(h.sendEmail.mock.calls.map(call => call[0])).toEqual(['smtp', 'resend']);
  });

  it('pins Web Push before sending and handles each subscription independently', async () => {
    const a = delivery({ id: 'a', channel: 'push', pushSubscriptionId: 'a' });
    const b = delivery({ id: 'b', channel: 'push', pushSubscriptionId: 'b' });
    const h = setup(a, b);
    h.sendPush
      .mockImplementationOnce(async () => {
        expect(a.transport).toBe('webpush');
        return { ok: true, transport: 'webpush' };
      })
      .mockResolvedValueOnce(deliveryFailure('push_failed', true));
    await h.kick();
    expect(a.state).toBe('sent');
    expect(b).toMatchObject({
      transport: 'webpush',
      state: 'queued',
      lastErrorCode: 'push_failed',
    });
  });
});
