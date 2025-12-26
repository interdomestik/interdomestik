import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendThankYouLetterCore: vi.fn(),
  previewThankYouLetterCore: vi.fn(),
  resendWelcomeEmailCore: vi.fn(),
}));

vi.mock('./thank-you-letter/send', () => ({
  sendThankYouLetterCore: (...args: unknown[]) => mocks.sendThankYouLetterCore(...args),
}));

vi.mock('./thank-you-letter/preview', () => ({
  previewThankYouLetterCore: (...args: unknown[]) => mocks.previewThankYouLetterCore(...args),
}));

vi.mock('./thank-you-letter/resend', () => ({
  resendWelcomeEmailCore: (...args: unknown[]) => mocks.resendWelcomeEmailCore(...args),
}));

let actions: typeof import('./thank-you-letter');

describe('thank-you-letter action wrappers', () => {
  beforeAll(async () => {
    actions = await import('./thank-you-letter');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendThankYouLetter delegates to core with same params', async () => {
    const params = {
      email: 'user@example.com',
      memberName: 'User',
      memberNumber: 'M-123',
      planName: 'Membership',
      planPrice: '€20.00',
      planInterval: 'year',
      memberSince: new Date('2025-01-01T00:00:00Z'),
      expiresAt: new Date('2026-01-01T00:00:00Z'),
      locale: 'en' as const,
    };

    mocks.sendThankYouLetterCore.mockResolvedValue({ success: true });

    const result = await actions.sendThankYouLetter(params);

    expect(mocks.sendThankYouLetterCore).toHaveBeenCalledWith(params);
    expect(result).toEqual({ success: true });
  });

  it('previewThankYouLetter delegates to core', async () => {
    const params = {
      memberName: 'User',
      memberNumber: 'M-123',
      planName: 'Membership',
      planPrice: '€20.00',
      planInterval: 'year',
      locale: 'sq' as const,
    };

    mocks.previewThankYouLetterCore.mockResolvedValue({ html: '<p>Hi</p>', text: 'Hi' });

    const result = await actions.previewThankYouLetter(params);

    expect(mocks.previewThankYouLetterCore).toHaveBeenCalledWith(params);
    expect(result).toEqual({ html: '<p>Hi</p>', text: 'Hi' });
  });

  it('resendWelcomeEmail delegates to core', async () => {
    mocks.resendWelcomeEmailCore.mockResolvedValue({ success: true });

    const result = await actions.resendWelcomeEmail('user-1');

    expect(mocks.resendWelcomeEmailCore).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ success: true });
  });
});
