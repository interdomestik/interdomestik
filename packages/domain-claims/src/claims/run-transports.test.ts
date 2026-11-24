import { ambiguous, refused, setup } from './run-dispatch.test-support';
import { describe, expect, it } from 'vitest';
import { deliveryFailure } from '@interdomestik/domain-communications/notification-deliveries/worker';
import { delivery, start, timestamp } from './run.test-support';

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
      .mockImplementationOnce(() => {
        expect(a.transport).toBe('webpush');
        return Promise.resolve({ ok: true, transport: 'webpush' });
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
