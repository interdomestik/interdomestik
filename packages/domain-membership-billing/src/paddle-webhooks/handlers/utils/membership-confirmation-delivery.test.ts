import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryablePaddleWebhookError } from '../../errors';
import { processMembershipConfirmation } from './membership-confirmation';

describe('membership confirmation delivery failures', () => {
  const sendThankYouLetter = vi.fn();
  const prepareThankYouLetter = vi.fn(({ email }) => ({
    to: email,
    subject: 'Membership confirmed',
    html: '<p>Membership confirmed</p>',
    text: 'Membership confirmed',
  }));
  const deliveryStore = {
    claim: vi.fn(),
    ready: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };
  const subscription = {
    id: 'sub_provider_1',
    status: 'active',
    items: [
      {
        price: {
          name: 'Annual membership',
          unit_price: { amount: '2000', currency_code: 'EUR' },
        },
      },
    ],
    billing_cycle: { frequency: 1, interval: 'year' },
    current_billing_period: {
      starts_at: '2026-01-01T00:00:00Z',
      ends_at: '2027-01-01T00:00:00Z',
    },
  };
  const userRecord = {
    email: 'member@example.test',
    name: 'Member One',
    memberNumber: 'MEM-2026-001',
  };
  const confirmationArgs = () => ({
    eventType: 'subscription.created',
    providerEventId: 'evt_provider_1',
    webhookPayloadHash: 'payload_hash_1',
    sub: subscription,
    tenantId: 'tenant_mk',
    userId: 'user_123',
    customData: { locale: 'en' as const },
    userRecord,
    deps: {
      membershipConfirmationDelivery: deliveryStore,
      prepareThankYouLetter,
      sendThankYouLetter,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    deliveryStore.claim.mockImplementation(async ({ snapshot }) => ({
      kind: 'claimed',
      deliveryId: 'delivery_123',
      requiresEffects: true,
      snapshot,
    }));
  });

  it('keeps claim-storage failures retryable before any provider request', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    deliveryStore.claim.mockRejectedValue(new Error('Tenant database unavailable'));

    await expect(processMembershipConfirmation(confirmationArgs())).rejects.toBeInstanceOf(
      RetryablePaddleWebhookError
    );
    expect(sendThankYouLetter).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('does not log delivery failure as success', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const success = vi.spyOn(console, 'log').mockImplementation(() => {});
    sendThankYouLetter.mockResolvedValue({ success: false, error: 'Provider rejected email' });

    await expect(processMembershipConfirmation(confirmationArgs())).rejects.toBeInstanceOf(
      RetryablePaddleWebhookError
    );

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Provider rejected email'));
    expect(success).not.toHaveBeenCalled();
    expect(deliveryStore.fail).toHaveBeenCalledWith({
      deliveryId: 'delivery_123',
      error: 'Provider rejected email',
      idempotencyKey: 'membership-confirmation:v1:tenant_mk:sub_provider_1',
      tenantId: 'tenant_mk',
    });
    error.mockRestore();
    success.mockRestore();
  });

  it('contains unexpected delivery exceptions', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendThankYouLetter.mockRejectedValue(new Error('Send failed'));

    await expect(processMembershipConfirmation(confirmationArgs())).rejects.toBeInstanceOf(
      RetryablePaddleWebhookError
    );

    expect(error).toHaveBeenCalled();
    expect(deliveryStore.fail).toHaveBeenCalled();
    error.mockRestore();
  });

  it('keeps a delivery retryable when recording the provider failure also fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendThankYouLetter.mockResolvedValue({ success: false, error: 'Provider timed out' });
    deliveryStore.fail.mockRejectedValue(new Error('Delivery ledger unavailable'));

    await expect(processMembershipConfirmation(confirmationArgs())).rejects.toBeInstanceOf(
      RetryablePaddleWebhookError
    );

    error.mockRestore();
  });
});
