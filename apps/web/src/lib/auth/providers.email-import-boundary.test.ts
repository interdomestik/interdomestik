import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<void> | void>,
  emailOTP: vi.fn((config: unknown) => config),
  evaluated: vi.fn(),
  importFailure: undefined as Error | undefined,
  normalize: vi.fn((value: string | null | undefined) => value ?? 'en'),
  reset: vi.fn(),
  send: vi.fn(),
}));
vi.mock('next/server', () => ({
  after: (callback: () => Promise<void> | void) => mocks.callbacks.push(callback),
}));
vi.mock('better-auth/plugins/email-otp', () => ({ emailOTP: mocks.emailOTP }));

type OtpConfig = {
  sendVerificationOTP: (
    input: { email: string; otp: string; type: string },
    context?: { request?: Request }
  ) => Promise<void>;
};
const message = { email: 'synthetic@example.com', otp: '123456', type: 'sign-in' };

function mockEmail() {
  vi.doMock('../email', () => {
    mocks.evaluated();
    if (mocks.importFailure) throw mocks.importFailure;
    return {
      normalizeSignInOtpLocale: mocks.normalize,
      sendPasswordResetEmail: mocks.reset,
      sendSignInOtpEmail: mocks.send,
    };
  });
}

async function providers() {
  const providerModule = await import('./providers');
  return providerModule.buildAuthProviders({ GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '' });
}

function otp(): OtpConfig {
  return mocks.emailOTP.mock.calls.at(-1)?.[0] as OtpConfig;
}

describe('email module import boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.callbacks.length = 0;
    mocks.importFailure = undefined;
    mocks.send.mockResolvedValue({ success: true });
    mocks.reset.mockResolvedValue(undefined);
    vi.stubEnv('OTP_CONTENT_FREE_LOGGING', '1');
    mockEmail();
  });
  afterEach(() => {
    vi.doUnmock('../email');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('does not evaluate email during provider setup or registration, then evaluates during delivery', async () => {
    const configured = await providers();
    expect(configured.plugins).toHaveLength(1);
    expect(mocks.evaluated).not.toHaveBeenCalled();
    const request = new Request('https://ida.test/api/auth/email-otp', {
      headers: { 'x-interdomestik-locale': 'en' },
    });
    await otp().sendVerificationOTP(message, { request });
    expect(mocks.callbacks).toHaveLength(1);
    expect(mocks.evaluated).not.toHaveBeenCalled();
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    request.headers.set('x-interdomestik-locale', 'sr');
    await mocks.callbacks[0]?.();
    expect(mocks.evaluated).toHaveBeenCalledOnce();
    expect(mocks.normalize).toHaveBeenCalledWith('en');
    expect(mocks.send).toHaveBeenCalledWith(message.email, message.otp, 'en');
  });

  it('keeps import rejection inside deferred delivery with content-free failure logging', async () => {
    mocks.importFailure = new Error('SYNTHETIC_IMPORT_FAILURE');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await providers();
    await expect(otp().sendVerificationOTP(message)).resolves.toBeUndefined();
    expect(mocks.evaluated).not.toHaveBeenCalled();
    await expect(mocks.callbacks[0]?.()).resolves.toBeUndefined();
    expect(mocks.evaluated).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(error.mock.calls).toEqual([['[auth][email-otp] deferred_delivery_failure']]);
  });

  it('waits for the reset sender after importing email and passes unchanged arguments', async () => {
    let resolve!: () => void;
    mocks.reset.mockReturnValue(
      new Promise<void>(done => {
        resolve = done;
      })
    );
    const configured = await providers();
    expect(mocks.evaluated).not.toHaveBeenCalled();
    let settled = false;
    const reset = configured.emailAndPassword
      .sendResetPassword({
        user: { email: message.email },
        url: 'https://ida.test/reset/synthetic',
      })
      .then(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(mocks.reset).toHaveBeenCalledOnce());
    expect(mocks.evaluated).toHaveBeenCalledOnce();
    expect(mocks.reset).toHaveBeenCalledWith(message.email, 'https://ida.test/reset/synthetic');
    expect(settled).toBe(false);
    resolve();
    await reset;
    expect(settled).toBe(true);
  });

  it('propagates reset import rejection without converting it to success', async () => {
    mocks.importFailure = new Error('SYNTHETIC_RESET_IMPORT_FAILURE');
    const configured = await providers();
    await expect(
      configured.emailAndPassword.sendResetPassword({
        user: { email: message.email },
        url: 'https://ida.test/reset/synthetic',
      })
    ).rejects.toThrow();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
});
