import { describe, expect, it, vi } from 'vitest';

import {
  PublicIntakeConfigurationError,
  runPublicIntake,
  type PublicRegistry,
} from './safe-action.public';

const registry: PublicRegistry = {
  version: 1,
  entries: [
    {
      id: 'free-start-intake',
      kind: 'server-action',
      operation: 'freeStart.submit',
      rateLimit: { limit: 5, windowSeconds: 60 },
    },
    { id: 'health', kind: 'route' },
    {
      id: 'bad-limit',
      kind: 'server-action',
      operation: 'bad.op',
      rateLimit: { limit: 0, windowSeconds: 60 },
    },
    {
      id: 'fractional',
      kind: 'server-action',
      operation: 'frac.op',
      rateLimit: { limit: 5, windowSeconds: 1.5 },
    },
  ],
};

function deps(result: Awaited<ReturnType<Parameters<typeof runPublicIntake>[1]['rateLimit']>>) {
  return { rateLimit: vi.fn(async () => result), headers: new Headers() };
}

describe('runPublicIntake', () => {
  it.each([
    ['an unknown entry id', 'missing', 'freeStart.submit'],
    ['a declared name the entry does not bind', 'free-start-intake', 'other.op'],
    ['an entry of another kind', 'health', 'freeStart.submit'],
    ['a zero limit', 'bad-limit', 'bad.op'],
    ['a fractional window', 'fractional', 'frac.op'],
  ])('fails on %s before any limiter call', async (_label, entryId, declaredName) => {
    const injected = deps({ limited: false });
    await expect(
      runPublicIntake({ declaredName, entryId, registry, input: {} }, injected)
    ).rejects.toBeInstanceOf(PublicIntakeConfigurationError);
    expect(injected.rateLimit).toHaveBeenCalledTimes(0);
  });

  it('limits under the production-sensitive policy with the entry limit and passes on', async () => {
    const injected = deps({ limited: false });
    const input = { email: 'x' };
    const result = await runPublicIntake(
      { declaredName: 'freeStart.submit', entryId: 'free-start-intake', registry, input },
      injected
    );
    expect(result).toEqual({ ok: true, input });
    expect(injected.rateLimit).toHaveBeenCalledWith({
      name: 'public:freeStart.submit',
      limit: 5,
      windowSeconds: 60,
      headers: injected.headers,
      productionSensitive: true,
    });
  });

  it.each([
    [429, 'RATE_LIMITED'],
    [503, 'SERVICE_UNAVAILABLE'],
  ] as const)('maps a %s from the limiter to %s with retryAfter', async (status, code) => {
    const injected = deps({ limited: true, status, retryAfter: 30, error: 'Too many requests' });
    const result = await runPublicIntake(
      { declaredName: 'freeStart.submit', entryId: 'free-start-intake', registry, input: {} },
      injected
    );
    expect(result).toEqual({ success: false, code, error: 'Too many requests', retryAfter: 30 });
  });
});
