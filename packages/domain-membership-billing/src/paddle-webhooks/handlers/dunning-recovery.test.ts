import { describe, expect, it, vi } from 'vitest';
import { deps, hoisted, seed } from './dunning-order.fixture';
import { pastDue, T1, T2 } from './dunning-order.test-support';
import { handleSubscriptionPastDue } from './dunning';

describe('ordered past-due effect recovery', () => {
  it('recovers effects when execution fails after the ordered state commits', async () => {
    seed('active', T1, 'evt_older');
    hoisted.store.crashAfterCommit = true;

    await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps)).rejects.toThrow(
      'injected post-commit crash'
    );
    expect(hoisted.store.row).toMatchObject({
      dunningAttemptCount: 1,
      providerEventId: 'evt_past_due',
    });
    expect(deps.sendPreparedPastDueEmail).not.toHaveBeenCalled();

    await handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps);

    expect(hoisted.store.row?.dunningAttemptCount).toBe(1);
    expect(hoisted.store.audits).toHaveLength(1);
    expect(deps.sendPreparedPastDueEmail).toHaveBeenCalledTimes(1);
  });

  it.each(['failAudit', 'failIntent'] as const)(
    'rolls back state, audit and intent on %s',
    async failure => {
      seed('active', T1, 'evt_old');
      hoisted.store[failure] = true;
      await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps)).rejects.toMatchObject({
        name: 'RetryablePaddleWebhookError',
      });
      expect(hoisted.store.row).toMatchObject({ status: 'active', dunningAttemptCount: 0 });
      expect(hoisted.store.audits).toHaveLength(0);
      expect(hoisted.store.deliveries).toHaveLength(0);
      expect(deps.sendPreparedPastDueEmail).not.toHaveBeenCalled();
    }
  );

  it('recovers an ambiguous provider success with the identical request and key', async () => {
    seed('active', T1, 'evt_old');
    hoisted.store.failAck = true;
    await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps)).rejects.toMatchObject({
      name: 'RetryablePaddleWebhookError',
      message: 'injected ack failure',
    });
    const original = vi.mocked(deps.sendPreparedPastDueEmail).mock.calls[0];
    hoisted.store.failAck = false;
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_1',
      tenantId: 'tenant_ks',
      email: 'changed@example.com',
      name: 'Changed',
    });
    await handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps);
    expect(vi.mocked(deps.sendPreparedPastDueEmail).mock.calls[1]).toEqual(original);
    expect(hoisted.store.deliveries[0]).toMatchObject({
      status: 'sent',
      providerMessageId: 'email-1',
    });
    expect(hoisted.store.audits).toHaveLength(1);
    expect(hoisted.store.row?.dunningAttemptCount).toBe(1);
  });

  it('retries a rejected email without losing intent or incrementing the counter', async () => {
    seed('active', T1, 'evt_old');
    vi.mocked(deps.sendPreparedPastDueEmail).mockResolvedValueOnce({
      success: false,
      error: 'outage',
    });
    await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps)).rejects.toThrow(
      'unconfirmed'
    );
    expect(hoisted.store.deliveries[0].status).toBe('pending');
    await handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps);
    expect(hoisted.store.deliveries[0].status).toBe('sent');
    expect(hoisted.store.row?.dunningAttemptCount).toBe(1);
    expect(hoisted.store.audits).toHaveLength(1);
  });

  it('serializes concurrent exact recovery so only one sender is invoked', async () => {
    seed('active', T1, 'evt_old');
    hoisted.store.crashAfterCommit = true;
    await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps)).rejects.toThrow();
    await Promise.all([
      handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps),
      handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps),
    ]);
    expect(deps.sendPreparedPastDueEmail).toHaveBeenCalledTimes(1);
    expect(hoisted.store.row?.dunningAttemptCount).toBe(1);
    expect(hoisted.store.audits).toHaveLength(1);
  });

  it('suppresses pending notification after a newer lifecycle event commits', async () => {
    seed('active', T1, 'evt_old');
    hoisted.store.crashAfterCommit = true;
    await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps)).rejects.toThrow();
    Object.assign(hoisted.store.row!, {
      status: 'active',
      providerEventOccurredAt: '2026-09-26T10:00:01Z',
      providerEventId: 'evt_recovered',
    });
    await handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps);
    expect(deps.sendPreparedPastDueEmail).not.toHaveBeenCalled();
    expect(hoisted.store.audits).toHaveLength(1);
    expect(hoisted.store.row?.status).toBe('active');
  });

  it.each([23 * 60 * 60 * 1000 - 1, 23 * 60 * 60 * 1000])(
    'honors the exact safe retry boundary at %i ms',
    async age => {
      seed('active', T1, 'evt_old');
      hoisted.store.crashAfterCommit = true;
      await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps)).rejects.toThrow();
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      hoisted.store.deliveries[0].createdAt = new Date(now - age);
      try {
        if (age < 23 * 60 * 60 * 1000) {
          await handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps);
          expect(deps.sendPreparedPastDueEmail).toHaveBeenCalledTimes(1);
        } else {
          await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps)).rejects.toThrow(
            'retry window expired'
          );
          expect(deps.sendPreparedPastDueEmail).not.toHaveBeenCalled();
        }
      } finally {
        clock.mockRestore();
      }
    }
  );

  it('does not recover a delivery from another tenant', async () => {
    seed('active', T1, 'evt_old');
    hoisted.store.crashAfterCommit = true;
    await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps)).rejects.toThrow();
    hoisted.store.deliveries[0].tenantId = 'tenant_mk';
    await handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps);
    expect(deps.sendPreparedPastDueEmail).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_ks', role: 'system' },
      expect.any(Function)
    );
  });
});
