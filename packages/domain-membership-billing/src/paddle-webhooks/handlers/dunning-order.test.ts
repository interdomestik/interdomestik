import { describe, expect, it } from 'vitest';
import { deps, hoisted, seed } from './dunning-order.fixture';
import { pastDue, T1, T2 } from './dunning-order.test-support';
import { handleSubscriptionPastDue } from './dunning';
import { PaddleEventOrderingError, RetryablePaddleWebhookError } from '../errors';

describe('handleSubscriptionPastDue entity-scoped provider event order', () => {
  it.each(['active', 'canceled'])(
    'ignores an older past_due after a newer %s snapshot without dunning effects',
    async status => {
      seed(status, T2, 'evt_newer');

      await expect(handleSubscriptionPastDue(pastDue(T1, 'evt_older'), deps)).resolves.toBe(
        undefined
      );

      expect(hoisted.store.row).toMatchObject({
        status,
        dunningAttemptCount: 0,
        providerEventOccurredAt: T2,
        providerEventId: 'evt_newer',
      });
      expect(hoisted.store.audits).toHaveLength(0);
      expect(deps.sendPreparedPastDueEmail).not.toHaveBeenCalled();
    }
  );

  it('applies a newer past_due after an older state with one dunning effect set', async () => {
    seed('active', T1, 'evt_older');

    await handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps);

    expect(hoisted.store.row).toMatchObject({
      status: 'past_due',
      dunningAttemptCount: 1,
      providerEventOccurredAt: T2,
      providerEventId: 'evt_past_due',
    });
    expect(hoisted.store.row?.pastDueAt).toBeInstanceOf(Date);
    expect(hoisted.store.audits).toHaveLength(1);
    expect(deps.sendPreparedPastDueEmail).toHaveBeenCalledTimes(1);
    expect(hoisted.findSubscriptionByProviderReference).toHaveBeenCalledWith('sub_1', {
      tenantId: 'tenant_ks',
    });
  });

  it('does not increment, audit or email again on exact replay', async () => {
    seed('active', T1, 'evt_older');
    await handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps);

    await handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps);

    expect(hoisted.store.row).toMatchObject({
      dunningAttemptCount: 1,
      providerEventId: 'evt_past_due',
    });
    expect(hoisted.store.audits).toHaveLength(1);
    expect(deps.sendPreparedPastDueEmail).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a distinct event at an equal occurred_at', async () => {
    seed('active', T2, 'evt_active');

    await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps)).rejects.toThrow(
      PaddleEventOrderingError
    );
    expect(hoisted.store.row).toMatchObject({ status: 'active', dunningAttemptCount: 0 });
    expect(hoisted.store.audits).toHaveLength(0);
    expect(deps.sendPreparedPastDueEmail).not.toHaveBeenCalled();
  });

  it.each([undefined, 'not-a-time'])(
    'fails closed before any lookup when occurred_at is %s',
    async occurredAt => {
      seed('active', T1, 'evt_older');

      await expect(
        handleSubscriptionPastDue(pastDue(occurredAt, 'evt_past_due'), deps)
      ).rejects.toThrow(PaddleEventOrderingError);
      expect(hoisted.findSubscriptionByProviderReference).not.toHaveBeenCalled();
      expect(hoisted.db.transaction).not.toHaveBeenCalled();
    }
  );

  it('never creates or replaces a first row from an entity past_due', async () => {
    hoisted.store.row = null;

    await expect(handleSubscriptionPastDue(pastDue(T2, 'evt_past_due'), deps)).rejects.toThrow(
      RetryablePaddleWebhookError
    );
    expect(hoisted.db.transaction).not.toHaveBeenCalled();
    expect(hoisted.db.insert).not.toHaveBeenCalled();
    expect(hoisted.db.update).not.toHaveBeenCalled();
    expect(deps.sendPreparedPastDueEmail).not.toHaveBeenCalled();
  });

  it('never lets a concurrent older past_due count or email twice', async () => {
    seed('active', T1, 'evt_active');

    await Promise.all([
      handleSubscriptionPastDue(pastDue('2026-09-26T10:00:00.300Z', 'evt_newest'), deps),
      handleSubscriptionPastDue(pastDue(T2, 'evt_newer'), deps),
    ]);

    expect(hoisted.store.row).toMatchObject({
      status: 'past_due',
      dunningAttemptCount: 1,
      providerEventId: 'evt_newest',
    });
    expect(hoisted.store.audits).toHaveLength(1);
    expect(deps.sendPreparedPastDueEmail).toHaveBeenCalledTimes(1);
  });
});
