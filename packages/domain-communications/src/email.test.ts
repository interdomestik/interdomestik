import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
  resendSend: vi.fn(),
  resendConstructor: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mocks.createTransport,
  },
  createTransport: mocks.createTransport,
}));

vi.mock('resend', () => ({
  Resend: function MockResend(...args: unknown[]) {
    mocks.resendConstructor(...args);
    return {
      emails: {
        send: mocks.resendSend,
      },
    };
  },
}));

describe('email delivery fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.INTERDOMESTIK_AUTOMATED = '0';
    process.env.PLAYWRIGHT = '0';
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'support@interdomestik.com';

    mocks.createTransport.mockReturnValue({
      sendMail: mocks.sendMail,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('falls back to Resend when SMTP transport fails', async () => {
    mocks.sendMail.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mocks.resendSend.mockResolvedValueOnce({
      data: { id: 'resend-message-id' },
      error: null,
    });

    const { sendPasswordResetEmail } = await import('./email');

    const result = await sendPasswordResetEmail(
      'member@example.com',
      'https://app.interdomestik.com/reset-password?token=abc'
    );

    expect(result).toEqual({ success: true, id: 'resend-message-id' });
    expect(mocks.sendMail).toHaveBeenCalledOnce();
    expect(mocks.resendConstructor).toHaveBeenCalledWith('re_test_key');
    expect(mocks.resendSend).toHaveBeenCalledOnce();
  });
});
