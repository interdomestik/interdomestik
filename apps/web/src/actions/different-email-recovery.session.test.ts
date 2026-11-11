import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  startDifferentEmailRecoveryCore,
  submitCurrentEmailProofCore,
  confirmReplacementEmailCore,
} from './different-email-recovery.core';

const h = vi.hoisted(() => ({
  provider: vi.fn(),
  rate: vi.fn(),
  send: vi.fn(),
  reserveCurrent: vi.fn(),
  reserveReplacement: vi.fn(),
  activateCurrent: vi.fn(),
  activateReplacement: vi.fn(),
  confirm: vi.fn(),
  discard: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.provider } } }));
vi.mock('@/lib/auth/different-email-recovery-store', () => ({
  reserveCurrentProof: h.reserveCurrent,
  reserveReplacementProof: h.reserveReplacement,
  activateCurrentProof: h.activateCurrent,
  activateReplacementProof: h.activateReplacement,
  confirmReplacementProof: h.confirm,
  discardProof: h.discard,
}));
vi.mock('@/lib/rate-limit-otp', () => ({ enforceOtpRateLimits: h.rate }));
vi.mock('@/lib/auth/different-email-recovery-email', () => ({ deliverRecoveryCode: h.send }));
const headers = new Headers({
  host: 'ida.localhost',
  cookie: 'tenantId=tenant_ks',
  'x-tenant-id': 'tenant_ks',
});
const user = {
  id: 'owner',
  email: 'owner@example.test',
  emailVerified: true,
  tenantId: 'tenant_mk',
};
async function allStages(requestHeaders: Headers = headers) {
  return [
    await startDifferentEmailRecoveryCore(requestHeaders, { locale: 'en' }),
    await submitCurrentEmailProofCore(requestHeaders, {
      code: '123456',
      email: 'new@example.test',
      locale: 'en',
    }),
    await confirmReplacementEmailCore(requestHeaders, { code: '654321' }),
  ];
}
function expectNoEffects(): void {
  for (const [name, effect] of Object.entries(h))
    if (name !== 'provider') expect(effect).not.toHaveBeenCalled();
}

describe('different-email recovery fresh session-derived scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
    vi.stubEnv('OTP_RATE_LIMIT_HMAC_SECRET', 's'.repeat(32));
    h.rate.mockResolvedValue(null);
    h.send.mockResolvedValue(true);
    h.reserveCurrent.mockResolvedValue({ ok: true });
    h.reserveReplacement.mockResolvedValue({ ok: true });
    h.activateCurrent.mockResolvedValue(true);
    h.activateReplacement.mockResolvedValue(true);
    h.confirm.mockResolvedValue({ ok: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['tenant_ks', 'tenant_mk', 'pilot-mk'])(
    'uses %s identity through both mailbox proofs despite ambient KS selectors',
    async tenantId => {
      h.provider.mockResolvedValue({ user: { ...user, tenantId } });
      expect(await allStages()).toEqual([
        { ok: true, stage: 'current' },
        { ok: true, stage: 'replacement' },
        { ok: true, stage: 'complete' },
      ]);
      expect(h.provider).toHaveBeenCalledTimes(3);
      for (const [args] of h.provider.mock.calls)
        expect(args).toEqual({
          headers,
          query: { disableCookieCache: true, disableRefresh: true },
        });
      expect(h.rate).toHaveBeenCalledTimes(4);
      for (const [args] of h.rate.mock.calls)
        expect(args).toMatchObject({ tenantId, dimensions: ['ip', 'identity'] });
      expect(h.reserveCurrent).toHaveBeenCalledWith(
        expect.objectContaining({ userId: user.id, currentEmail: user.email })
      );
      expect(h.reserveReplacement).toHaveBeenCalledWith(
        expect.objectContaining({ userId: user.id, newEmail: 'new@example.test' })
      );
      expect(h.confirm).toHaveBeenCalledWith(user.id, expect.any(Function), expect.any(Date));
    }
  );

  it('prefers explicit verified access scope over the home tenant', async () => {
    h.provider.mockResolvedValue({
      user: { ...user, tenantId: 'tenant_ks', accessTenantId: 'pilot-mk' },
    });
    expect(await startDifferentEmailRecoveryCore(headers, { locale: 'en' })).toEqual({
      ok: true,
      stage: 'current',
    });
    expect(h.rate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'pilot-mk' }));
  });

  it.each([
    null,
    {},
    { user: { ...user, email: '' } },
    { user: { ...user, tenantId: null } },
    { user: { ...user, accessTenantId: 'unknown' } },
  ])('denies missing/revoked/malformed identity %j with zero effects', async raw => {
    h.provider.mockResolvedValue(raw);
    expect(await allStages()).toEqual(
      Array.from({ length: 3 }, () => ({ ok: false, code: 'unavailable' }))
    );
    expectNoEffects();
  });

  it('refuses a revoked session at the next proof stage', async () => {
    h.provider.mockResolvedValueOnce({ user });
    expect(await startDifferentEmailRecoveryCore(headers, { locale: 'en' })).toMatchObject({
      ok: true,
    });
    vi.clearAllMocks();
    h.provider.mockResolvedValue(null);
    expect(
      await submitCurrentEmailProofCore(headers, {
        code: '123456',
        email: 'new@example.test',
        locale: 'en',
      })
    ).toEqual({ ok: false, code: 'unavailable' });
    expectNoEffects();
  });

  it('retains conflicting host rejection before provider or other effects', async () => {
    expect(
      await allStages(
        new Headers({ host: 'ida.localhost', 'x-forwarded-host': 'attacker.example' })
      )
    ).toEqual(Array.from({ length: 3 }, () => ({ ok: false, code: 'unavailable' })));
    expect(h.provider).not.toHaveBeenCalled();
    expectNoEffects();
  });
});
