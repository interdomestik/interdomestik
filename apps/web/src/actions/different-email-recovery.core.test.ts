import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmReplacementEmailCore,
  expireRecoverySessionCache,
  recoveryDigest,
  startDifferentEmailRecoveryCore,
  submitCurrentEmailProofCore,
  type RecoveryDependencies,
} from './different-email-recovery.core';

const { getSession, captureException } = vi.hoisted(() => ({
  getSession: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@sentry/nextjs', async importOriginal => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureException,
}));

const requestHeaders = new Headers({ host: 'ida.localhost', 'x-forwarded-for': '127.0.0.1' });
const context = { email: 'owner@example.com', tenantId: 'tenant_ks', userId: 'owner-1' } as const;
const actions = [
  { name: 'start', run: startDifferentEmailRecoveryCore, input: { locale: 'en' } },
  {
    name: 'current proof',
    run: submitCurrentEmailProofCore,
    input: { code: '123456', email: 'new@example.com', locale: 'en' },
  },
  { name: 'replacement confirmation', run: confirmReplacementEmailCore, input: { code: '123456' } },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function dependencies(overrides: Partial<RecoveryDependencies> = {}): RecoveryDependencies {
  return {
    activateCurrent: vi.fn().mockResolvedValue(true),
    activateReplacement: vi.fn().mockResolvedValue(true),
    confirmReplacement: vi.fn().mockResolvedValue({ ok: true }),
    discard: vi.fn().mockResolvedValue(undefined),
    isPublicIntakeOpen: vi.fn().mockResolvedValue(true),
    nonce: () => '11111111-1111-4111-8111-111111111111',
    now: () => new Date('2026-08-07T12:00:00.000Z'),
    otp: () => '123456',
    rate: vi.fn().mockResolvedValue(true),
    reserveCurrent: vi.fn().mockResolvedValue({ ok: true }),
    reserveReplacement: vi.fn().mockResolvedValue({ ok: true }),
    resolveContext: vi.fn().mockResolvedValue(context),
    secret: () => 's'.repeat(32),
    send: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function expectNoEffects(deps: RecoveryDependencies) {
  for (const effect of [
    deps.rate,
    deps.reserveCurrent,
    deps.reserveReplacement,
    deps.activateCurrent,
    deps.activateReplacement,
    deps.confirmReplacement,
    deps.discard,
    deps.send,
  ]) {
    expect(effect).not.toHaveBeenCalled();
  }
}

describe('IDA-UI03b recovery action boundary', () => {
  it.each(actions)(
    '$name returns CLOSED before rate, proof and mail work',
    async ({ run, input }) => {
      const deps = dependencies({ isPublicIntakeOpen: vi.fn().mockResolvedValue(false) });

      expect(await run(requestHeaders, input, deps)).toEqual({ ok: false, code: 'CLOSED' });
      expect(deps.isPublicIntakeOpen).toHaveBeenCalledExactlyOnceWith(context.tenantId);
      expectNoEffects(deps);
    }
  );

  it.each(actions)(
    '$name reports a switch reader error and returns CLOSED',
    async ({ run, input }) => {
      const error = new Error('switch read failed');
      const deps = dependencies({ isPublicIntakeOpen: vi.fn().mockRejectedValue(error) });

      expect(await run(requestHeaders, input, deps)).toEqual({ ok: false, code: 'CLOSED' });
      expect(captureException).toHaveBeenCalledWith(error, expect.any(Object));
      expectNoEffects(deps);
    }
  );

  it.each([undefined, 'tenant_invalid', 'tenant_ks '])(
    'returns unavailable before effects with default tenant %s',
    async tenant => {
      vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', tenant);
      for (const { run, input } of actions) {
        expect(await run(requestHeaders, input)).toEqual({ ok: false, code: 'unavailable' });
      }
      expect(getSession).not.toHaveBeenCalled();
    }
  );

  it('returns CLOSED if the switch closes before the replacement commits', async () => {
    const deps = dependencies({
      confirmReplacement: vi.fn().mockResolvedValue({ ok: false, code: 'CLOSED' }),
    });
    expect(await confirmReplacementEmailCore(requestHeaders, { code: '123456' }, deps)).toEqual({
      ok: false,
      code: 'CLOSED',
    });
  });

  it('rejects selectors and fails closed before persistence when authority is unavailable', async () => {
    const deps = dependencies();
    expect(
      await startDifferentEmailRecoveryCore(requestHeaders, { locale: 'en', userId: 'other' }, deps)
    ).toEqual({ ok: false, code: 'invalid' });
    expect(deps.resolveContext).not.toHaveBeenCalled();

    const unavailable = dependencies({ resolveContext: vi.fn().mockResolvedValue(null) });
    expect(
      await startDifferentEmailRecoveryCore(requestHeaders, { locale: 'en' }, unavailable)
    ).toEqual({ ok: false, code: 'unavailable' });
    expect(unavailable.reserveCurrent).not.toHaveBeenCalled();

    const noSecret = dependencies({ secret: () => null });
    expect(
      await startDifferentEmailRecoveryCore(requestHeaders, { locale: 'en' }, noSecret)
    ).toEqual({ ok: false, code: 'unavailable' });
    expect(noSecret.send).not.toHaveBeenCalled();
  });

  it('awaits current delivery and removes the exact disabled proof when delivery fails', async () => {
    const send = vi.fn().mockResolvedValue(false),
      discard = vi.fn();
    const deps = dependencies({ discard, send });
    const result = await startDifferentEmailRecoveryCore(requestHeaders, { locale: 'sq' }, deps);
    expect(result).toEqual({ ok: false, code: 'unavailable' });
    expect(send).toHaveBeenCalledWith({
      code: '123456',
      email: context.email,
      locale: 'sq',
      stage: 'current',
    });
    expect(discard).toHaveBeenCalledWith(context.userId, 'current', expect.any(String));
    expect(deps.activateCurrent).not.toHaveBeenCalled();
  });

  it('advances only after both deliveries and binds replacement confirmation to its target', async () => {
    const deps = dependencies();
    expect(await startDifferentEmailRecoveryCore(requestHeaders, { locale: 'en' }, deps)).toEqual({
      ok: true,
      stage: 'current',
    });
    expect(
      await submitCurrentEmailProofCore(
        requestHeaders,
        { code: '654321', email: 'NEW@Example.com ', locale: 'en' },
        deps
      )
    ).toEqual({ ok: true, stage: 'replacement' });
    const reserved = vi.mocked(deps.reserveReplacement).mock.calls[0]![0];
    expect(reserved.newEmail).toBe('new@example.com');
    expect(reserved.currentDigest).toBe(
      recoveryDigest('s'.repeat(32), 'current', context.email, '654321')
    );

    expect(await confirmReplacementEmailCore(requestHeaders, { code: '999999' }, deps)).toEqual({
      ok: true,
      stage: 'complete',
    });
    const [userId, tenantId, digest] = vi.mocked(deps.confirmReplacement).mock.calls[0]!;
    expect({ userId, tenantId }).toEqual({ userId: context.userId, tenantId: context.tenantId });
    expect(digest('new@example.com')).toBe(
      recoveryDigest('s'.repeat(32), 'replacement', 'new@example.com', '999999')
    );
    expect(deps.rate).toHaveBeenCalledTimes(4);
    expect(vi.mocked(deps.isPublicIntakeOpen).mock.calls).toEqual([
      [context.tenantId],
      [context.tenantId],
      [context.tenantId],
    ]);
  });

  it('attempts exact proof cleanup when either activation throws', async () => {
    const current = dependencies({ activateCurrent: vi.fn().mockRejectedValue(new Error('lost')) });
    expect(
      await startDifferentEmailRecoveryCore(requestHeaders, { locale: 'en' }, current)
    ).toEqual({ ok: false, code: 'unavailable' });
    expect(current.discard).toHaveBeenCalledWith(
      context.userId,
      'current',
      '11111111-1111-4111-8111-111111111111'
    );

    const replacement = dependencies({
      activateReplacement: vi.fn().mockRejectedValue(new Error('lost')),
    });
    expect(
      await submitCurrentEmailProofCore(
        requestHeaders,
        { code: '654321', email: 'new@example.com', locale: 'en' },
        replacement
      )
    ).toEqual({ ok: false, code: 'unavailable' });
    expect(replacement.discard).toHaveBeenCalledWith(
      context.userId,
      'replacement',
      '11111111-1111-4111-8111-111111111111'
    );
  });

  it('expires only Better Auth session-data cache cookie names', () => {
    const remove = vi.fn();
    expireRecoverySessionCache({ delete: remove });
    expect(remove.mock.calls.map(([name]) => name)).toEqual([
      'better-auth.session_data',
      '__Secure-better-auth.session_data',
      '__Host-better-auth.session_data',
    ]);
    expect(remove.mock.calls.flat().join(' ')).not.toContain('session_token');
  });
});
