import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  callbacks: [] as Array<() => Promise<void> | void>,
  emailOTP: vi.fn((config: unknown) => config),
  send: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: (callback: () => Promise<void> | void) => {
    mocks.callbacks.push(callback);
    mocks.after(callback);
  },
}));
vi.mock('better-auth/plugins/email-otp', () => ({ emailOTP: mocks.emailOTP }));
vi.mock('../email', () => ({
  normalizeSignInOtpLocale: vi.fn(() => 'sq'),
  sendPasswordResetEmail: vi.fn(),
  sendSignInOtpEmail: mocks.send,
}));

import { buildAuthProviders } from './providers';

type OtpPluginConfig = {
  allowedAttempts?: number;
  disableSignUp?: boolean;
  expiresIn?: number;
  resendStrategy?: string;
  storeOTP?: string;
  sendVerificationOTP: (
    input: { email: string; otp: string; type: string },
    context?: { request?: Request }
  ) => Promise<void>;
};

function plugin(): OtpPluginConfig {
  buildAuthProviders({ GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '' });
  return mocks.emailOTP.mock.calls.at(-1)?.[0] as OtpPluginConfig;
}

describe('IDA-UI03a0b2 deferred OTP provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OTP_CONTENT_FREE_LOGGING', '1');
    mocks.callbacks.length = 0;
    mocks.send.mockResolvedValue({ success: true });
  });

  it('C17 configures the frozen verifier and registers delivery without awaiting it', async () => {
    const config = plugin();
    await config.sendVerificationOTP({
      email: 'registered@example.com',
      otp: '123456',
      type: 'sign-in',
    });

    expect(config).toEqual(
      expect.objectContaining({
        storeOTP: 'hashed',
        expiresIn: 300,
        allowedAttempts: 3,
        resendStrategy: 'rotate',
        disableSignUp: false,
      })
    );
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('C18 gives registered and unregistered addresses the same one-callback delivery trace', async () => {
    const config = plugin();
    await config.sendVerificationOTP({
      email: 'registered@example.com',
      otp: '111111',
      type: 'sign-in',
    });
    await config.sendVerificationOTP({
      email: 'new@example.com',
      otp: '222222',
      type: 'sign-in',
    });

    expect(mocks.callbacks).toHaveLength(2);
    await mocks.callbacks[0]?.();
    await mocks.callbacks[1]?.();
    expect(mocks.send.mock.calls.map(call => call.length)).toEqual([3, 3]);
  });

  it('C19 contains deferred provider rejection and logs no OTP, email or raw error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.send.mockResolvedValue({ success: false, error: 'RAW_PROVIDER_SECRET' });
    const config = plugin();
    await config.sendVerificationOTP({
      email: 'private@example.com',
      otp: '654321',
      type: 'sign-in',
    });

    await expect(mocks.callbacks[0]?.()).resolves.toBeUndefined();
    const serialized = JSON.stringify(error.mock.calls);
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('654321');
    expect(serialized).not.toContain('RAW_PROVIDER_SECRET');
    error.mockRestore();
  });
});
