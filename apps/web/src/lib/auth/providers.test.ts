import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emailOTP: vi.fn((config: unknown) => config),
  normalizeSignInOtpLocale: vi.fn((value: string | null | undefined) =>
    ['sq', 'en', 'sr', 'mk'].includes(value ?? '') ? value : 'en'
  ),
  sendPasswordResetEmail: vi.fn(),
  sendSignInOtpEmail: vi.fn(),
  callbacks: [] as Array<() => Promise<void> | void>,
}));

vi.mock('next/server', () => ({
  after: (callback: () => Promise<void> | void) => mocks.callbacks.push(callback),
}));

vi.mock('better-auth/plugins/email-otp', () => ({
  emailOTP: mocks.emailOTP,
}));

vi.mock('../email', () => ({
  normalizeSignInOtpLocale: mocks.normalizeSignInOtpLocale,
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  sendSignInOtpEmail: mocks.sendSignInOtpEmail,
}));

import { authProviders, buildAuthProviders } from './providers';

describe('authProviders email OTP plugin', () => {
  const otpPlugin = mocks.emailOTP.mock.calls[0]?.[0] as {
    sendVerificationOTP: (
      args: { email: string; otp: string; type: string },
      context?: { request?: Request }
    ) => Promise<void>;
  };

  it('registers the email OTP plugin', () => {
    expect(authProviders.plugins).toHaveLength(1);
    expect(mocks.emailOTP).toHaveBeenCalledTimes(1);
    expect(otpPlugin).toBeDefined();
  });

  it('omits the GitHub social provider when OAuth credentials are absent', () => {
    const providers = buildAuthProviders({
      GITHUB_CLIENT_ID: '',
      GITHUB_CLIENT_SECRET: '',
    });

    expect(providers).not.toHaveProperty('socialProviders.github');
  });

  beforeEach(() => {
    mocks.sendPasswordResetEmail.mockReset();
    mocks.sendSignInOtpEmail.mockReset();
    mocks.sendSignInOtpEmail.mockResolvedValue({ success: true });
    mocks.callbacks.length = 0;
  });

  it('contains sign-in OTP email delivery failure after scheduling', async () => {
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
    ).resolves.toBeUndefined();
    await expect(mocks.callbacks[0]?.()).resolves.toBeUndefined();
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

  it.each([
    ['sr', 'sr'],
    ['de', 'en'],
  ])('allowlists the %s OTP wording locale as %s', async (header, expected) => {
    await otpPlugin.sendVerificationOTP(
      { email: 'member@example.com', otp: '123456', type: 'sign-in' },
      {
        request: new Request('https://ida.test/api/auth/email-otp', {
          headers: { 'x-interdomestik-locale': header },
        }),
      }
    );
    await mocks.callbacks[0]?.();

    expect(mocks.sendSignInOtpEmail).toHaveBeenCalledWith('member@example.com', '123456', expected);
  });
});
