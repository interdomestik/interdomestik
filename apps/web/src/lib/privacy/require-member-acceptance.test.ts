import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthorizedSession } from '@/lib/tenant-authority.server';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import {
  memberGuarded,
  requireAdmittedMember,
  requireMemberAcceptancePage,
  withMemberAcceptance,
} from './require-member-acceptance';

const mocks = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  readOwnAcceptanceState: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: mocks.authorizeSessionTenant,
}));
vi.mock('@interdomestik/domain-privacy/acceptance', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/domain-privacy/acceptance')>()),
  readOwnAcceptanceState: mocks.readOwnAcceptanceState,
}));
vi.mock('@interdomestik/database/tenant-authority', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database/tenant-authority')>();
  return {
    ...actual,
    readTenantAuthority: (authority: Parameters<typeof actual.readTenantAuthority>[0]) => ({
      ...actual.readTenantAuthority(authority),
      purpose: 'session',
    }),
  };
});

function asAuthorizedSession(role: string): AuthorizedSession {
  const user = { id: 'fixture-member', role, tenantId: 'fixture-tenant' };
  return {
    authority: mintTestTenantAuthority(user.tenantId, { userId: user.id, role }),
    session: { user } as AuthorizedSession['session'],
  };
}

const missing = { accepted: false, missing: [{ kind: 'terms', version: 'current' }] };

async function assertImmutableAdmission(expected: AuthorizedSession) {
  const authority = expected.authority;
  const admission = await requireAdmittedMember();
  if (!admission.ok) throw new Error('Expected an admitted request');

  const replacement = asAuthorizedSession('user');
  expect(() => Object.assign(admission, { authorized: replacement })).toThrow(TypeError);
  expect(() => Object.assign(admission.authorized, { authority: replacement.authority })).toThrow(
    TypeError
  );

  const subsequent = await requireAdmittedMember();
  if (!subsequent.ok) throw new Error('Expected the request to remain admitted');
  expect(subsequent.authorized).toBe(expected);
  expect(subsequent.authorized.authority).toBe(authority);
  return { admission, subsequent };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeSessionTenant.mockResolvedValue(asAuthorizedSession('member'));
  mocks.readOwnAcceptanceState.mockResolvedValue(missing);
});

describe('member acceptance admission', () => {
  it.each(['member', 'user'])('refuses the raw %s role before running an action', async role => {
    mocks.authorizeSessionTenant.mockResolvedValue(asAuthorizedSession(role));
    const effect = vi.fn();
    await expect(memberGuarded(effect)()).resolves.toMatchObject({
      success: false,
      code: 'acceptance_required',
    });
    expect(effect).not.toHaveBeenCalled();
  });

  it.each(['agent', 'staff'])(
    'passes known workforce role %s to the existing guard',
    async role => {
      const authorized = asAuthorizedSession(role);
      mocks.authorizeSessionTenant.mockResolvedValue(authorized);
      const effect = vi.fn().mockResolvedValue('result');
      await expect(memberGuarded(effect)()).resolves.toBe('result');
      expect(effect).toHaveBeenCalledWith(authorized);
      expect(mocks.readOwnAcceptanceState).not.toHaveBeenCalled();
    }
  );

  it('refuses a role outside the catalogue without querying acceptance', async () => {
    mocks.authorizeSessionTenant.mockResolvedValue(asAuthorizedSession('unknown'));
    const effect = vi.fn();
    await expect(memberGuarded(effect)()).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    expect(effect).not.toHaveBeenCalled();
    expect(mocks.readOwnAcceptanceState).not.toHaveBeenCalled();
  });

  it('returns 403 before invoking a protected route', async () => {
    const effect = vi.fn();
    const response = await withMemberAcceptance(effect)(
      new Request('https://example.test/api/claims')
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'acceptance_required' });
    expect(effect).not.toHaveBeenCalled();
  });

  it('evaluates a refused second request independently of the previous admission', async () => {
    mocks.readOwnAcceptanceState.mockResolvedValueOnce({ accepted: true });
    const effect = vi.fn(async () => {
      expect((await requireAdmittedMember()).ok).toBe(true);
      expect((await requireAdmittedMember()).ok).toBe(true);
      return new Response();
    });
    const route = withMemberAcceptance(effect);
    expect((await route(new Request('https://example.test/api/claims'))).status).toBe(200);
    expect((await route(new Request('https://example.test/api/claims'))).status).toBe(403);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(mocks.readOwnAcceptanceState).toHaveBeenCalledTimes(2);
  });

  it.each(['route', 'action'])('shares a frozen admission within a %s request', async entry => {
    const authorized = asAuthorizedSession('member');
    mocks.authorizeSessionTenant.mockResolvedValue(authorized);
    mocks.readOwnAcceptanceState.mockResolvedValue({ accepted: true });
    const handler = vi.fn(async () => {
      const { admission, subsequent } = await assertImmutableAdmission(authorized);
      expect(subsequent).toBe(admission);
      return new Response();
    });
    if (entry === 'route') {
      await withMemberAcceptance(handler)(new Request('https://example.test/api/claims'));
    } else {
      await memberGuarded(handler)();
    }
    expect(handler).toHaveBeenCalledOnce();
    expect(mocks.readOwnAcceptanceState).toHaveBeenCalledOnce();
  });

  it('freezes admissions returned through the page guard', async () => {
    const authorized = asAuthorizedSession('member');
    mocks.authorizeSessionTenant.mockResolvedValue(authorized);
    mocks.readOwnAcceptanceState.mockResolvedValue({ accepted: true });
    await assertImmutableAdmission(authorized);
  });

  it('freezes unauthenticated and unaccepted page refusals', async () => {
    mocks.authorizeSessionTenant.mockResolvedValueOnce(null);
    const unauthenticated = await requireMemberAcceptancePage();
    expect(unauthenticated).toMatchObject({ ok: false, failure: { code: 'UNAUTHORIZED' } });
    expect(Object.isFrozen(unauthenticated)).toBe(true);
    const unaccepted = await requireMemberAcceptancePage();
    expect(unaccepted).toMatchObject({ ok: false, failure: { code: 'acceptance_required' } });
    expect(Object.isFrozen(unaccepted)).toBe(true);
  });

  it('refuses a loader when the page ignores the current refusal', async () => {
    mocks.readOwnAcceptanceState.mockResolvedValueOnce({ accepted: true });
    expect((await requireAdmittedMember()).ok).toBe(true);

    expect(await requireMemberAcceptancePage()).toMatchObject({
      ok: false,
      missing: missing.missing,
    });
    expect(await requireAdmittedMember()).toMatchObject({ ok: false });
  });

  it('propagates a query error', async () => {
    const failure = new Error('Test acceptance read failure');
    mocks.readOwnAcceptanceState.mockRejectedValue(failure);
    await expect(requireAdmittedMember()).rejects.toBe(failure);
  });
});
