import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaddleWebhookPayloadSchemaError } from '../errors';
import { buildRawTrialingSubscriptionCreatedData } from '../paddle-null-fields.fixture';
import { handleSubscriptionPastDue } from './dunning';
import { handleSubscriptionChanged } from './subscriptions';
import { handleTransactionCompleted } from './transaction';
import { TEST_PADDLE_DELIVERY, mockUserOwner, resetPaddleHandlerMocks } from './test-support';

const hoisted = await vi.hoisted(async () => {
  const { createHoistedPaddleHandlerMocks } = await import('./test-support');
  return createHoistedPaddleHandlerMocks();
});

vi.mock('@interdomestik/database', async () =>
  (await import('./test-support')).createPaddleDatabaseMockModule(hoisted)
);
vi.mock('../../commissions/create', async () =>
  (await import('./test-support')).createCommissionMockModule()
);
vi.mock('@interdomestik/database/member-number', async () =>
  (await import('./test-support')).createMemberNumberMockModule()
);

describe('Paddle payloads with provider nulls', () => {
  const logAuditEvent = vi.fn();
  const sendThankYouLetter = vi.fn();

  beforeEach(() => {
    resetPaddleHandlerMocks(hoisted);
    logAuditEvent.mockReset();
    sendThankYouLetter.mockReset();
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    mockUserOwner(hoisted, 'tenant_ks');
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.test',
      name: 'Member One',
      memberNumber: 'MEM-2026-001',
      tenantId: 'tenant_ks',
    });
  });

  it('creates the trialing subscription from the raw subscription.created payload', async () => {
    const raw = buildRawTrialingSubscriptionCreatedData();
    // An agent-attributed checkout keeps the referral-reward lookup out of this handler test.
    const data = {
      ...raw,
      custom_data: { ...(raw.custom_data as Record<string, unknown>), agentId: 'agent_1' },
    };

    await handleSubscriptionChanged(
      { delivery: TEST_PADDLE_DELIVERY, eventType: 'subscription.created', data },
      { logAuditEvent, sendThankYouLetter }
    );

    expect(hoisted.tx.insert).toHaveBeenCalled();
    expect(hoisted.appendEvent).toHaveBeenCalledWith(
      hoisted.tx,
      expect.objectContaining({
        eventName: 'membership.subscription_changed',
        payload: { cancelAtPeriodEnd: false, fromStatus: 'none', toStatus: 'trialing' },
      })
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.updated',
        entityId: 'sub_01nullfieldsfixture00000001',
        metadata: expect.objectContaining({
          eventType: 'subscription.created',
          status: 'trialing',
          userId: 'user_123',
        }),
      })
    );
  });

  it('throws a retryable schema error instead of silently dropping a subscription event', async () => {
    const data = { ...buildRawTrialingSubscriptionCreatedData(), scheduled_change: 'cancel' };

    await expect(
      handleSubscriptionChanged(
        { delivery: TEST_PADDLE_DELIVERY, eventType: 'subscription.created', data },
        { logAuditEvent, sendThankYouLetter }
      )
    ).rejects.toThrow(
      new PaddleWebhookPayloadSchemaError('subscription', [
        { path: ['scheduled_change'], code: 'invalid_type' },
      ])
    );
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('throws a retryable schema error for an invalid past_due payload', async () => {
    await expect(
      handleSubscriptionPastDue(
        { delivery: TEST_PADDLE_DELIVERY, data: { id: 'sub_123' } },
        { logAuditEvent }
      )
    ).rejects.toBeInstanceOf(PaddleWebhookPayloadSchemaError);
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('throws a retryable schema error for an invalid transaction payload', async () => {
    await expect(
      handleTransactionCompleted(
        { delivery: TEST_PADDLE_DELIVERY, data: { id: 'txn_123' } },
        { logAuditEvent }
      )
    ).rejects.toThrow('Invalid Paddle transaction data: status (invalid_type)');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
