import { beforeEach, vi } from 'vitest';
import {
  hoisted,
  receiptAdmission,
  subscriptionLookup,
  TEST_PADDLE_DELIVERY,
} from './_core.fixture';

export function installCoreHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.sha256Hex.mockReturnValue('payload_hash');
    hoisted.parsePaddleWebhookBody.mockReturnValue({
      parsedPayload: {
        event_type: 'transaction.completed',
        event_id: 'evt_payload',
        data: {
          id: 'txn_payload_1',
          subscriptionId: 'sub_provider_1',
          customData: { leadId: 'lead_payload_1' },
        },
      },
      eventTypeFromPayload: 'transaction.completed',
      eventIdFromPayload: 'evt_payload',
      eventTimestampFromPayload: null,
    });
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        data: {
          id: 'txn_verified_1',
          subscriptionId: 'sub_provider_1',
          customData: { leadId: 'lead_1' },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });
    hoisted.findPaddleSubscriptionByReference.mockResolvedValue(
      subscriptionLookup({
        id: 'sub_internal_1',
        tenantId: 'tenant_1',
        userId: 'user_1',
      })
    );
    hoisted.resolvePaddleUserOwner.mockResolvedValue(null);
    hoisted.insertWebhookEvent.mockResolvedValue(receiptAdmission());
    hoisted.persistInvoiceAndLedgerInvariants.mockResolvedValue(undefined);
    hoisted.hasTenantLeadForConversion.mockResolvedValue(true);
    hoisted.convertLeadToMember.mockResolvedValue({
      userId: 'member_user_1',
      createdSubscriptionId: 'membership_1',
    });
    hoisted.handlePaddleEvent.mockResolvedValue(undefined);
    hoisted.markWebhookProcessed.mockResolvedValue(undefined);
    hoisted.markWebhookFailed.mockResolvedValue(undefined);
  });
}
