import { describe, expect, it } from 'vitest';

import { revalidateOnboardingIntent, resolveOnboardingAuthority } from './onboarding-authority';

const at = 1_800_000_000_000;
const ida = () => new Headers({ host: 'ida.localhost:3000' });
const selector = (tenant = 'tenant_ks', mode: 'resolved' | 'deferred' = 'resolved') => ({
  onboarding: { tenant, mode },
});

describe('server onboarding authority', () => {
  it('resolves tenant hosts and IDA deferred mode without a fallback tenant', () => {
    expect(
      resolveOnboardingAuthority({
        headers: new Headers({ host: 'ks.localhost:3000' }),
        body: selector(),
        now: at,
      })
    ).toMatchObject({ ok: true, intent: { tenant: 'tenant_ks', mode: 'resolved' } });
    expect(
      resolveOnboardingAuthority({
        headers: ida(),
        body: selector('tenant_mk', 'deferred'),
        now: at,
      })
    ).toMatchObject({ ok: true, intent: { tenant: 'tenant_mk', mode: 'deferred' } });
    expect(
      resolveOnboardingAuthority({ headers: ida(), body: selector('tenant_ks'), now: at })
    ).toMatchObject({ ok: false, reason: 'forbidden_mode' });
    expect(
      resolveOnboardingAuthority({
        headers: new Headers({ host: 'unknown.example' }),
        body: selector(),
        now: at,
      })
    ).toMatchObject({ ok: false, reason: 'unknown_host' });
  });

  it.each([
    [{}, 'missing_selector'],
    [{ onboarding: { tenant: 'invalid', mode: 'resolved' } }, 'malformed_selector'],
    [selector('tenant_mk'), 'tenant_mismatch'],
    [selector('tenant_ks', 'deferred'), 'forbidden_mode'],
  ] as const)('rejects invalid context: %s', (body, reason) => {
    const headers =
      reason === 'missing_selector' || reason === 'malformed_selector'
        ? ida()
        : new Headers({ host: 'ks.localhost:3000' });
    expect(resolveOnboardingAuthority({ headers, body, now: at })).toMatchObject({
      ok: false,
      reason,
    });
  });

  it('rejects forwarded-host conflict and stale or rebound intents', () => {
    const conflict = new Headers({
      host: 'ida.localhost:3000',
      'x-forwarded-host': 'ks.localhost:3000',
    });
    expect(
      resolveOnboardingAuthority({ headers: conflict, body: selector(), now: at })
    ).toMatchObject({
      ok: false,
      reason: 'host_conflict',
    });
    const issued = resolveOnboardingAuthority({
      headers: ida(),
      body: selector('tenant_ks', 'deferred'),
      now: at,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(revalidateOnboardingIntent(issued.intent, ida(), at + 60_000)).toEqual(issued.intent);
    expect(revalidateOnboardingIntent(issued.intent, ida(), at + 601_000)).toBeNull();
    expect(
      revalidateOnboardingIntent(issued.intent, new Headers({ host: 'ks.localhost:3000' }), at)
    ).toBeNull();
  });
});
