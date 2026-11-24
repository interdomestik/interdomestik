import {
  createInput,
  expectedContext,
  publicIntake,
} from './free-start-drafts.admission.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFreeStartDraftCore } from './free-start-drafts/lifecycle.core';
import { resolveFreeStartDraftSession } from './free-start-drafts/session.core';

describe('anonymous draft intake after an authRequired session verdict', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
    vi.stubEnv('INTERDOMESTIK_DEPLOY_ENV', 'staging');
    vi.stubEnv('INTERDOMESTIK_PRODUCTION', undefined);
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
    vi.mocked(resolveFreeStartDraftSession).mockResolvedValueOnce({
      ok: false,
      code: 'authRequired',
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('returns CLOSED for unresolvable ingress before looking up authority or reading a switch', async () => {
    const request = new Headers({ host: 'unknown.staging.interdomestik.com' });
    await expect(createFreeStartDraftCore(request, createInput(expectedContext))).resolves.toEqual({
      ok: false,
      code: 'CLOSED',
      error: 'draft.CLOSED',
    });
    expect(publicIntake.authorize).not.toHaveBeenCalled();
    expect(publicIntake.transaction).not.toHaveBeenCalled();
    expect(publicIntake.read).not.toHaveBeenCalled();
  });

  it.each([
    ['staging.interdomestik.com', 'tenant_ks'],
    ['mk.staging.interdomestik.com', 'tenant_mk'],
  ])('reads only the resolved intake switch for %s', async (host, tenantId) => {
    const request = new Headers({ host });
    const authority = mintTestTenantAuthority(tenantId);
    const tx = {};
    publicIntake.authorize.mockResolvedValueOnce(authority);
    publicIntake.transaction.mockImplementationOnce((_, effect) => effect(tx));
    publicIntake.read.mockResolvedValueOnce({ state: 'open' });
    await expect(createFreeStartDraftCore(request, createInput(expectedContext))).resolves.toEqual({
      ok: false,
      code: 'authRequired',
    });
    expect(publicIntake.authorize.mock.calls).toEqual([[tenantId]]);
    expect(publicIntake.transaction).toHaveBeenCalledExactlyOnceWith(
      authority,
      expect.any(Function)
    );
    expect(publicIntake.read.mock.calls).toEqual([[tx, tenantId, 'public_intake']]);
  });
});
