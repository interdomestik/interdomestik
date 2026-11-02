import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_PADDLE_DELIVERY } from './paddle-authority.test-support';

const handlers = vi.hoisted(() => ({
  handleSubscriptionChanged: vi.fn(),
  handleSubscriptionPastDue: vi.fn(),
  handleTransactionCompleted: vi.fn(),
}));

vi.mock('./handlers/subscriptions', () => ({
  handleSubscriptionChanged: handlers.handleSubscriptionChanged,
}));
vi.mock('./handlers/dunning', () => ({
  handleSubscriptionPastDue: handlers.handleSubscriptionPastDue,
}));
vi.mock('./handlers/transaction', () => ({
  handleTransactionCompleted: handlers.handleTransactionCompleted,
}));

import { handlePaddleEvent } from './handle';

describe('handlePaddleEvent delivery threading', () => {
  const authority = mintTestTenantAuthority('tenant_ks');
  const deps = { logAuditEvent: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    'subscription.created',
    'subscription.updated',
    'subscription.canceled',
    'subscription.paused',
    'subscription.resumed',
  ])('hands the verified delivery and tenant authority to the %s handler', async eventType => {
    await handlePaddleEvent(
      { eventType, data: { id: 'sub_1' }, delivery: TEST_PADDLE_DELIVERY, authority },
      deps
    );

    expect(handlers.handleSubscriptionChanged).toHaveBeenCalledWith(
      expect.objectContaining({ eventType, delivery: TEST_PADDLE_DELIVERY, authority }),
      deps
    );
    expect(handlers.handleSubscriptionChanged.mock.calls[0]![0]).not.toHaveProperty('tenantId');
  });

  it('hands the verified delivery and tenant authority to the past_due handler', async () => {
    await handlePaddleEvent(
      {
        eventType: 'subscription.past_due',
        data: { id: 'sub_1' },
        delivery: TEST_PADDLE_DELIVERY,
        authority,
      },
      deps
    );

    expect(handlers.handleSubscriptionPastDue).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: TEST_PADDLE_DELIVERY, authority }),
      deps
    );
  });

  it('hands only the verified delivery to the transaction handler', async () => {
    await handlePaddleEvent(
      {
        eventType: 'transaction.completed',
        data: { id: 'txn_1' },
        delivery: TEST_PADDLE_DELIVERY,
        authority: null,
      },
      deps
    );

    expect(handlers.handleTransactionCompleted).toHaveBeenCalledWith(
      { data: { id: 'txn_1' }, delivery: TEST_PADDLE_DELIVERY },
      deps
    );
  });

  it('runs no handler for a missing or unhandled event type', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await handlePaddleEvent({ eventType: undefined, data: {}, delivery: TEST_PADDLE_DELIVERY });
    await handlePaddleEvent({
      eventType: 'customer.updated',
      data: {},
      delivery: TEST_PADDLE_DELIVERY,
    });

    expect(handlers.handleSubscriptionChanged).not.toHaveBeenCalled();
    expect(handlers.handleSubscriptionPastDue).not.toHaveBeenCalled();
    expect(handlers.handleTransactionCompleted).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
