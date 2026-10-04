import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureRedirect,
  clearNeutralHostOverrides,
  COUNTRY_ALIAS_CONTEXT,
  NON_NEUTRAL_REQUEST_HOST,
  PUBLIC_FRONT_DOOR_CONTEXT,
  renderLoginPage,
  restoreNeutralHostEnv,
  snapshotNeutralHostEnv,
  throwNextRedirect,
  type BootstrapRedirectArgs,
} from './_core.entry-test-support';

import { getLoginEntryMocks } from './_core.entry-test-mocks';

import LoginPage from './_core.entry';

const hoisted = getLoginEntryMocks();

const originalEnv = new Map<string, string | undefined>();

function installDeterministicRequest(): void {
  snapshotNeutralHostEnv(originalEnv);
  // An ambient configured host could otherwise make the request host an admitted neutral entry.
  clearNeutralHostOverrides();
  hoisted.requestHeadersMock.mockResolvedValue(new Headers({ host: NON_NEUTRAL_REQUEST_HOST }));
  hoisted.redirectMock.mockImplementation(throwNextRedirect);
  hoisted.getSessionSafeMock.mockResolvedValue(null);
}

afterEach(() => restoreNeutralHostEnv(originalEnv));

describe('LoginPage authenticated continuation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDeterministicRequest();
    hoisted.bootstrapRedirectMock.mockReturnValue(null);
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValue(COUNTRY_ALIAS_CONTEXT);
  });

  it.each([
    { role: 'member', next: '/en/member/claims/9', expected: '/en/member/claims/9' },
    { role: 'user', next: '/en/member?tab=claims', expected: '/en/member?tab=claims' },
    { role: 'agent', next: '/en/agent/members', expected: '/en/agent/members' },
    { role: 'staff', next: '/en/staff/claims/9', expected: '/en/staff/claims/9' },
    { role: 'admin', next: '/en/admin/overview', expected: '/en/admin/overview' },
  ])(
    'honors a valid $role continuation on an authenticated visit',
    async ({ role, next, expected }) => {
      hoisted.getSessionSafeMock.mockResolvedValue({ user: { role } });

      await expect(captureRedirect(LoginPage, { searchParams: { next } })).resolves.toBe(expected);
    }
  );

  it.each([
    { name: 'a traversal escape', next: '/en/member/../admin/overview' },
    { name: 'an encoded traversal escape', next: '/en/member/..%2F..%2Fadmin' },
    { name: 'a cross-role target', next: '/en/admin/overview' },
    { name: 'a cross-locale target', next: '/sq/member/claims' },
    { name: 'an external target', next: '//foreign.invalid/en/member' },
    { name: 'an absolute target', next: 'https://foreign.invalid/en/member' },
    { name: 'a backslash target', next: '/en/member\\..\\admin' },
    { name: 'a relative target', next: 'en/member' },
  ])('falls back to the canonical member route for $name', async ({ next }) => {
    hoisted.getSessionSafeMock.mockResolvedValue({ user: { role: 'member' } });

    await expect(captureRedirect(LoginPage, { searchParams: { next } })).resolves.toBe(
      '/en/member'
    );
  });

  it('ignores ambiguous duplicate continuation values', async () => {
    hoisted.getSessionSafeMock.mockResolvedValue({ user: { role: 'member' } });

    await expect(
      captureRedirect(LoginPage, { searchParams: { next: ['/en/member/claims/9', '/en/admin'] } })
    ).resolves.toBe('/en/member');
  });

  it('redirects an authenticated visit without a continuation to the canonical route', async () => {
    hoisted.getSessionSafeMock.mockResolvedValue({ user: { role: 'staff' } });

    await expect(captureRedirect(LoginPage, {})).resolves.toBe('/en/staff/claims');
  });

  it('keeps rendering the form for an authenticated role without a canonical route', async () => {
    hoisted.getSessionSafeMock.mockResolvedValue({ user: { role: 'promoter' } });

    render(await renderLoginPage(LoginPage, { searchParams: { next: '/en/member' } }));

    expect(screen.getByText('login-form')).toBeInTheDocument();
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
  });
});

// The suite above mocks the bootstrap decision per case; this one mounts the page against the real
// helper so the actual neutral round-trip behaviour is asserted rather than mocked away.
describe('LoginPage mounted tenant bootstrap', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    installDeterministicRequest();

    const actual = await vi.importActual<typeof import('./_core')>('./_core');
    hoisted.bootstrapRedirectMock.mockImplementation(args =>
      actual.getLoginTenantBootstrapRedirect(args as BootstrapRedirectArgs)
    );
  });

  it('renders the neutral entry with a deliberate query tenant and no tenant-context round trip', async () => {
    // The deliberate query must stay on the URL for the form to submit, so no cookie bootstrap may
    // strip it.
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValue(PUBLIC_FRONT_DOOR_CONTEXT);

    render(
      await renderLoginPage(LoginPage, {
        searchParams: { tenantId: 'tenant_mk', next: '/en/member/claims' },
      })
    );

    expect(hoisted.redirectMock).not.toHaveBeenCalled();
    expect(hoisted.loginFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined })
    );
    expect(hoisted.databaseSelectMock).not.toHaveBeenCalled();
  });

  it('does not loop when the neutral entry is revisited with the same query tenant', async () => {
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValue(PUBLIC_FRONT_DOOR_CONTEXT);
    const searchParams = { tenantId: 'tenant_mk', next: '/en/member/claims' };

    await expect(captureRedirect(LoginPage, { searchParams })).resolves.toBeNull();
    await expect(captureRedirect(LoginPage, { searchParams })).resolves.toBeNull();
  });

  it('still bootstraps a resolved context tenant that differs from the query tenant', async () => {
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValue({
      kind: 'tenant',
      tenantId: 'tenant_ks',
      source: 'cookie',
    });

    await expect(
      captureRedirect(LoginPage, {
        searchParams: { tenantId: 'tenant_mk', next: '/en/member/claims' },
      })
    ).resolves.toBe(
      '/en/login/tenant-context?tenantId=tenant_mk&next=%2Fen%2Flogin%3Fnext%3D%252Fen%252Fmember%252Fclaims'
    );
  });

  it('keeps carrying a resolved country-host tenant without a round trip', async () => {
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValue({
      kind: 'tenant',
      tenantId: 'tenant_mk',
      source: 'compatibility_alias',
    });

    render(await renderLoginPage(LoginPage, { searchParams: { tenantId: 'tenant_mk' } }));

    expect(hoisted.redirectMock).not.toHaveBeenCalled();
    expect(hoisted.loginFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_mk' })
    );
  });
});
