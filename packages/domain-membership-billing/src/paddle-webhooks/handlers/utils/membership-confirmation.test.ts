import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processMembershipConfirmation, redactEmail } from './membership-confirmation';

describe('redactEmail', () => {
  it('rejects missing and malformed addresses', () => {
    expect(redactEmail(undefined)).toBe('unknown');
    expect(redactEmail(null)).toBe('unknown');
    expect(redactEmail('')).toBe('unknown');
    expect(redactEmail('invalid')).toBe('unknown');
  });

  it('masks short and long local parts', () => {
    expect(redactEmail('a@b.com')).toBe('a*@b.com');
    expect(redactEmail('ab@b.com')).toBe('a*@b.com');
    expect(redactEmail('john.doe@example.com')).toBe('j***e@example.com');
    expect(redactEmail('alice@test.com')).toBe('a***e@test.com');
  });
});

describe('processMembershipConfirmation', () => {
  const sendThankYouLetter = vi.fn();
  const userRecord = {
    email: 'member@example.test',
    name: 'Member One',
    memberNumber: 'MEM-2026-001',
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

  beforeEach(() => {
    vi.clearAllMocks();
    sendThankYouLetter.mockResolvedValue({ success: true });
  });

  it('sends exact active provider and authoritative member values', async () => {
    await processMembershipConfirmation({
      eventType: 'subscription.created',
      sub: subscription,
      tenantId: 'tenant_mk',
      customData: { locale: 'sr' },
      userRecord,
      deps: { sendThankYouLetter },
    });

    expect(sendThankYouLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'member@example.test',
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        locale: 'sr',
        memberNumber: 'MEM-2026-001',
        memberSince: new Date('2026-01-01T00:00:00.000Z'),
        planInterval: 'godina',
        planName: 'Annual membership',
        planPrice: expect.stringContaining('EUR'),
        providerReference: 'sub_provider_1',
        tenantId: 'tenant_mk',
      })
    );
  });

  it('refuses an active confirmation from a non-created provider event', async () => {
    await processMembershipConfirmation({
      eventType: 'subscription.updated',
      sub: subscription,
      tenantId: 'tenant_mk',
      customData: { locale: 'sr' },
      userRecord,
      deps: { sendThankYouLetter },
    });

    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it.each(['trialing', 'past_due', 'paused', 'canceled', 'deleted'])(
    'does not send active confirmation for provider status %s',
    async status => {
      await processMembershipConfirmation({
        eventType: 'subscription.created',
        sub: { ...subscription, status },
        tenantId: 'tenant_mk',
        customData: { locale: 'mk' },
        userRecord,
        deps: { sendThankYouLetter },
      });

      expect(sendThankYouLetter).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['missing locale', subscription, undefined, userRecord],
    ['unsupported locale', subscription, { locale: 'de' }, userRecord],
    ['non-string locale', subscription, { locale: 42 }, userRecord],
    [
      'missing provider price',
      { ...subscription, items: [] },
      { locale: 'mk' as const },
      userRecord,
    ],
    [
      'missing provider period',
      { ...subscription, current_billing_period: undefined },
      { locale: 'mk' as const },
      userRecord,
    ],
    [
      'missing member number',
      subscription,
      { locale: 'mk' as const },
      { ...userRecord, memberNumber: null },
    ],
  ])('does not invent confirmation values when %s', async (_name, sub, customData, member) => {
    await processMembershipConfirmation({
      eventType: 'subscription.created',
      sub,
      tenantId: 'tenant_mk',
      customData,
      userRecord: member,
      deps: { sendThankYouLetter },
    });

    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('does nothing when the delivery dependency is unavailable', async () => {
    await expect(
      processMembershipConfirmation({
        eventType: 'subscription.created',
        sub: subscription,
        tenantId: 'tenant_mk',
        customData: { locale: 'mk' },
        userRecord,
        deps: {},
      })
    ).resolves.toBeUndefined();
  });

  it('does not log delivery failure as success', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const success = vi.spyOn(console, 'log').mockImplementation(() => {});
    sendThankYouLetter.mockResolvedValue({ success: false, error: 'Provider rejected email' });

    await processMembershipConfirmation({
      eventType: 'subscription.created',
      sub: subscription,
      tenantId: 'tenant_mk',
      customData: { locale: 'mk' },
      userRecord,
      deps: { sendThankYouLetter },
    });

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Provider rejected email'));
    expect(success).not.toHaveBeenCalled();
    error.mockRestore();
    success.mockRestore();
  });

  it('contains unexpected delivery exceptions', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendThankYouLetter.mockRejectedValue(new Error('Send failed'));

    await expect(
      processMembershipConfirmation({
        eventType: 'subscription.created',
        sub: subscription,
        tenantId: 'tenant_mk',
        customData: { locale: 'en' },
        userRecord,
        deps: { sendThankYouLetter },
      })
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
