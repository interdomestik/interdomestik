import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  confirmFreeStartDraftHandoffCore,
  reviewFreeStartDraftHandoffCore,
  type FreeStartDraftHandoffDependencies,
} from './free-start-drafts/handoff.core';

const headers = new Headers({ host: 'ida.interdomestik.com' });
const context = {
  accessTenantId: 'tenant_ks' as const,
  actorRole: 'member',
  ownerUserId: 'owner-1',
  tenantId: 'tenant_ks' as const,
};

function deps(
  overrides: Partial<FreeStartDraftHandoffDependencies> = {}
): FreeStartDraftHandoffDependencies {
  return {
    confirmHandoff: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
    resolveSession: vi.fn().mockResolvedValue({ ok: true, context }),
    reviewHandoff: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
    ...overrides,
  };
}

describe('free-start draft claim action boundary C07-C12', () => {
  it('resolves fresh server authority and forwards no client authority', async () => {
    const id = randomUUID();
    const reviewHandoff = vi.fn().mockResolvedValue({ ok: false, code: 'membershipRequired' });
    const dependencies = deps({ reviewHandoff });

    expect(await reviewFreeStartDraftHandoffCore(headers, { id }, dependencies)).toEqual({
      ok: false,
      code: 'membershipRequired',
    });
    expect(dependencies.resolveSession).toHaveBeenCalledWith(headers);
    expect(reviewHandoff).toHaveBeenCalledWith(context, id);
  });

  it('rejects malformed, unsupported-locale and injected-authority confirmation inputs', async () => {
    const id = randomUUID();
    const confirmHandoff = vi.fn();
    const dependencies = deps({ confirmHandoff });
    for (const input of [
      { id, expectedVersion: 1, locale: 'de' },
      { id, expectedVersion: 0, locale: 'en' },
      { id, expectedVersion: 1, locale: 'en', ownerUserId: 'other' },
      { id: 'not-a-uuid', expectedVersion: 1, locale: 'en' },
    ]) {
      expect(await confirmFreeStartDraftHandoffCore(headers, input, dependencies)).toEqual({
        ok: false,
        code: 'invalid',
      });
    }
    expect(confirmHandoff).not.toHaveBeenCalled();
  });

  it('returns bounded generic session and repository failures without raw leakage', async () => {
    const id = randomUUID();
    expect(
      await reviewFreeStartDraftHandoffCore(
        headers,
        { id },
        deps({ resolveSession: vi.fn().mockResolvedValue({ ok: false, code: 'authRequired' }) })
      )
    ).toEqual({ ok: false, code: 'authRequired' });
    expect(
      await reviewFreeStartDraftHandoffCore(
        headers,
        { id },
        deps({ reviewHandoff: vi.fn().mockRejectedValue(new Error('PRIVATE')) })
      )
    ).toEqual({ ok: false, code: 'unavailable' });
  });
});
