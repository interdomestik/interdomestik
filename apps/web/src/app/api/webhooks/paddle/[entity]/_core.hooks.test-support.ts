import { hoisted, TEST_PADDLE_DELIVERY } from './_core.test-support';
import { beforeEach, vi } from 'vitest';

export function installCoreHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.handlePaddleWebhookCore.mockResolvedValue({ status: 200, body: { success: true } });
    hoisted.parsePaddleWebhookBody.mockReturnValue({
      parsedPayload: {
        event_type: 'transaction.completed',
        data: {
          customData: {
            userId: 'user_ks',
          },
        },
      },
      eventTypeFromPayload: 'transaction.completed',
      eventIdFromPayload: 'evt_ks',
      eventTimestampFromPayload: new Date('2026-02-23T00:00:00.000Z'),
    });
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_ks',
        data: {
          customData: {
            userId: 'user_ks',
          },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });
    hoisted.resolvePaddleUserOwner.mockResolvedValue({
      userId: 'user_owner',
      tenantId: 'tenant_ks',
    });
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValue(null);
    hoisted.dbSubscriptionFindFirst.mockResolvedValue(null);
  });
}
