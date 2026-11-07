import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('better-auth/api', () => ({
  createAuthMiddleware: (handler: (ctx: unknown) => Promise<void>) => handler,
}));
vi.mock('./different-email-recovery-store', () => ({ verifyResetMailbox: mocks.verify }));

import { resetCompletionPlugin } from './reset-completion';

type Ctx = { path: string; body?: unknown; query?: unknown; context: { returned?: unknown } };
const plugin = resetCompletionPlugin();
const [hook] = plugin.hooks?.after ?? [];
const run = hook.handler as unknown as (ctx: Ctx) => Promise<void>;
const matches = hook.matcher as unknown as (ctx: Ctx) => boolean;
const done = (overrides: Partial<Ctx> = {}): Ctx => ({
  path: '/reset-password',
  body: { token: 'token-1', newPassword: 'x' },
  context: { returned: { status: true } },
  ...overrides,
});

describe('resetCompletionPlugin (ACQ-2c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(undefined);
  });

  it('runs one after hook, only for the reset endpoint', () => {
    expect(plugin.id).toBe('ida-reset-completion');
    expect(plugin.hooks?.after).toHaveLength(1);
    expect(plugin.hooks?.before).toBeUndefined();
    expect(matches(done())).toBe(true);
    expect(matches(done({ path: '/request-password-reset' }))).toBe(false);
  });

  it('verifies the mailbox bound to a completed reset token', async () => {
    await run(done());
    expect(mocks.verify).toHaveBeenCalledWith('token-1');
  });

  it.each([
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
