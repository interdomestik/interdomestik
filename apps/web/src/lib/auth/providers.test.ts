import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emailOTP: vi.fn((config: unknown) => config),
  sendPasswordResetEmail: vi.fn(),
  sendSignInOtpEmail: vi.fn(),
}));

vi.mock('better-auth/plugins/email-otp', () => ({
  emailOTP: mocks.emailOTP,
}));

vi.mock('../email', () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  sendSignInOtpEmail: mocks.sendSignInOtpEmail,
}));

import { authProviders } from './providers';

describe('authProviders email OTP plugin', () => {
  const otpPlugin = mocks.emailOTP.mock.calls[0]?.[0] as {
    sendVerificationOTP: (args: { email: string; otp: string; type: string }) => Promise<void>;
  };

  it('registers the email OTP plugin', () => {
    expect(authProviders.plugins).toHaveLength(1);
    expect(mocks.emailOTP).toHaveBeenCalledTimes(1);
    expect(otpPlugin).toBeDefined();
  });

  beforeEach(() => {
    mocks.sendPasswordResetEmail.mockReset();
    mocks.sendSignInOtpEmail.mockReset();
    mocks.sendSignInOtpEmail.mockResolvedValue({ success: true });
  });

  it('throws when sign-in OTP email delivery fails', async () => {
    mocks.sendSignInOtpEmail.mockResolvedValue({
      success: false,
      error: 'Email provider unavailable',
    });

    await expect(
      otpPlugin.sendVerificationOTP({
        email: 'member@example.com',
        otp: '123456',
        type: 'sign-in',
      })
    ).rejects.toThrow('Email provider unavailable');
  });

  it('ignores non sign-in OTP types', async () => {
    await expect(
      otpPlugin.sendVerificationOTP({
        email: 'member@example.com',
        otp: '123456',
        type: 'email-verification',
      })
    ).resolves.toBeUndefined();

    expect(mocks.sendSignInOtpEmail).not.toHaveBeenCalled();
  });
});
