import { afterEach, describe, expect, it, vi } from 'vitest';
import { deps, hoisted, seed } from './dunning-order.fixture';
import { KS_AUTHORITY, pastDue, T1, T2 } from './dunning-order.test-support';
import { handleSubscriptionPastDue } from './dunning';
import * as sponsorCoverage from './dunning-sponsor';

afterEach(() => vi.restoreAllMocks());

describe('ordered past-due effect recovery', () => {
  it.each([true, false])(
    'retains structured source through persistence and covered=%s replay',
    async covered => {
      seed('active', T1, 'evt_old');
      vi.spyOn(sponsorCoverage, 'readPastDueAccessContinues').mockResolvedValue(covered);
      vi.spyOn(sponsorCoverage, 'pastDueAccessContinuesInTx').mockResolvedValue(covered);
      vi.mocked(deps.preparePastDueEmail).mockImplementation((to, params) => ({
        from: 'support@example.com',
        to,
        subject: 'Payment failed',
        html: '<p>Due</p>',
        text: 'Due',
        source: {
          version: 1,
          kind: 'standard',
          params: {
            title: 'Payment failed',
            intro: params.accessContinues ? 'Covered' : 'Uncovered',
            ctaLabel: 'Open membership',
            ctaUrl: 'https://staging.interdomestik.com/en/member',
          },
        },
      }));
      hoisted.store.crashAfterCommit = true;
      await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_source'), deps)).rejects.toThrow(
        'injected post-commit crash'
      );
      // Replay reads the persisted JSON rather than the freshly prepared request.
      await handleSubscriptionPastDue(pastDue(T2, 'evt_source'), deps);
      expect(deps.sendPreparedPastDueEmail).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          source: {
            version: 1,
            kind: 'standard',
            params: {
              title: 'Payment failed',
              intro: covered ? 'Covered' : 'Uncovered',
              ctaLabel: 'Open membership',
              ctaUrl: 'https://staging.interdomestik.com/en/member',
            },
          },
        }),
        expect.any(String)
      );
    }
  );

  it.each([true, false])(
    'refreshes coverage on delivery replay (access continues: %s)',
    async covered => {
      seed('active', T1, 'evt_old');
      vi.spyOn(sponsorCoverage, 'readPastDueAccessContinues').mockResolvedValue(!covered);
      const coverage = vi
        .spyOn(sponsorCoverage, 'pastDueAccessContinuesInTx')
        .mockResolvedValue(!covered);
      vi.mocked(deps.preparePastDueEmail).mockImplementation((to, params) => ({
        from: 'support@example.com',
        to,
        subject: params.planName,
        html: params.accessContinues ? '<p>Payment facts only</p>' : '<p>Access may end</p>',
        text: params.accessContinues ? 'Payment facts only' : 'Access may end',
      }));
      vi.mocked(deps.sendPreparedPastDueEmail).mockResolvedValueOnce({
        success: false,
        error: 'outage',
      });
      await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps)).rejects.toThrow(
        'unconfirmed'
      );
      const originalKey = vi.mocked(deps.sendPreparedPastDueEmail).mock.calls[0]?.[1];
      coverage.mockResolvedValue(covered);
      await handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps);
      expect(deps.sendPreparedPastDueEmail).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: covered ? 'Payment facts only' : 'Access may end' }),
        originalKey
      );
      expect(hoisted.store.row?.dunningAttemptCount).toBe(1);
    }
  );

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
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(KS_AUTHORITY, expect.any(Function));
  });
  it('records suppression as skipped without a provider receipt and does not retry it', async () => {
    seed('active', T1, 'evt_old');
    vi.mocked(deps.sendPreparedPastDueEmail).mockResolvedValue({
      success: false,
      error: 'email_suppressed',
    });
    await handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps);
    expect(hoisted.store.deliveries[0]).toMatchObject({
      status: 'skipped',
      error: 'email_suppressed',
      providerMessageId: null,
      sentAt: null,
    });
    await handleSubscriptionPastDue(pastDue(T2, 'evt_due'), deps);
    expect(deps.sendPreparedPastDueEmail).toHaveBeenCalledOnce();
  });
});
