import { describe, expect, it, vi } from 'vitest';

import {
  confirmReplacementEmailCore,
  expireRecoverySessionCache,
  recoveryDigest,
  startDifferentEmailRecoveryCore,
  submitCurrentEmailProofCore,
  type RecoveryDependencies,
} from './different-email-recovery.core';

const requestHeaders = new Headers({ host: 'ida.localhost', 'x-forwarded-for': '127.0.0.1' });
const context = { email: 'owner@example.com', tenantId: 'tenant_ks', userId: 'owner-1' };

function dependencies(overrides: Partial<RecoveryDependencies> = {}): RecoveryDependencies {
  return {
    activateCurrent: vi.fn().mockResolvedValue(true),
    activateReplacement: vi.fn().mockResolvedValue(true),
    confirmReplacement: vi.fn().mockResolvedValue({ ok: true }),
    discard: vi.fn().mockResolvedValue(undefined),
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

describe('IDA-UI03b recovery action boundary', () => {
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
    const digest = vi.mocked(deps.confirmReplacement).mock.calls[0]![1];
    expect(digest('new@example.com')).toBe(
      recoveryDigest('s'.repeat(32), 'replacement', 'new@example.com', '999999')
    );
    expect(deps.rate).toHaveBeenCalledTimes(4);
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
