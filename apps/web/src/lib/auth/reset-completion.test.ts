import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('better-auth/api', () => ({
  createAuthMiddleware: (handler: (ctx: unknown) => Promise<void>) => handler,
}));
vi.mock('./different-email-recovery-store', () => ({ verifyResetMailbox: mocks.verify }));

import { resetCompletion } from './reset-completion';

type Ctx = { path: string; body?: unknown; query?: unknown; context: { returned?: unknown } };
const run = resetCompletion as unknown as (ctx: Ctx) => Promise<void>;
const done = (overrides: Partial<Ctx> = {}): Ctx => ({
  path: '/reset-password',
  body: { token: 'token-1', newPassword: 'x' },
  context: { returned: { status: true } },
  ...overrides,
});

describe('resetCompletion (ACQ-2c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(undefined);
  });

  it('verifies the mailbox bound to a completed reset token', async () => {
    await run(done());
    expect(mocks.verify).toHaveBeenCalledWith('token-1');
  });

  it.each([
    ['another endpoint', done({ path: '/request-password-reset' })],
    ['a refused reset', done({ context: { returned: new Error('INVALID_TOKEN') } })],
    ['an unsuccessful result', done({ context: { returned: { status: false } } })],
    ['a missing token', done({ body: { newPassword: 'x' } })],
  ])('verifies nothing for %s', async (_label, ctx) => {
    await run(ctx);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('keeps the completed reset when verification fails and logs no content', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.verify.mockRejectedValue(new Error('token-1 member@example.com'));
    await expect(run(done())).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('[auth][reset] mailbox_verification_failed');
    log.mockRestore();
  });
});
