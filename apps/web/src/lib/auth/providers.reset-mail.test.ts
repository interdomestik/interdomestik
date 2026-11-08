import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  release: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('better-auth/plugins/email-otp', () => ({ emailOTP: vi.fn((config: unknown) => config) }));
vi.mock('./different-email-recovery-store', () => ({ releaseResetMailIfCurrent: mocks.release }));
vi.mock('../email', () => ({
  normalizeSignInOtpLocale: vi.fn(() => 'en'),
  sendPasswordResetEmail: mocks.reset,
  sendSignInOtpEmail: vi.fn(),
}));

import { authProviders } from './providers';

const USER = { id: 'user-1', email: 'Member@Example.com' };
const URL_ = 'https://ida.test/api/auth/reset-password/token-1?callbackURL=%2Fsq%2Freset-password';

function sendReset(): Promise<void> {
  return authProviders.emailAndPassword.sendResetPassword({
    user: USER,
    url: URL_,
    token: 'token-1',
  });
}

/** ACQ-2c: a reset link is mailed only to the address the account still uses. */
describe('reset mail release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reset.mockResolvedValue(undefined);
  });

  it('revokes every session of the user when a reset completes', () => {
    expect(authProviders.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
  });

  it('mails the link when the mailbox is still current', async () => {
    mocks.release.mockResolvedValue(true);
    await sendReset();
    expect(mocks.release).toHaveBeenCalledWith('user-1', 'token-1', 'Member@Example.com');
    expect(mocks.reset).toHaveBeenCalledWith('Member@Example.com', URL_);
  });

  it('withholds the link for a mailbox the account no longer uses', async () => {
    mocks.release.mockResolvedValue(false);
    await expect(sendReset()).resolves.toBeUndefined();
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('fails closed without mailing when the currency check cannot run', async () => {
    const failure = new Error('SYNTHETIC_LOCK_FAILURE');
    mocks.release.mockRejectedValue(failure);
    await expect(sendReset()).rejects.toBe(failure);
    expect(mocks.reset).not.toHaveBeenCalled();
  });
});
