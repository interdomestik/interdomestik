import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveLoginTenantHint,
  resolveSocialOnboardingTenantContext,
} from '@/components/auth/login-tenant-hint';
import { resolveTenantContextFromRequest } from '@/lib/tenant/tenant-request';

import {
  captureRedirect,
  renderLoginPage,
  restoreNeutralHostEnv,
  setDevelopmentNeutralHostEnv,
  setProductionNeutralHostEnv,
  snapshotNeutralHostEnv,
  throwNextRedirect,
  type MockSession,
} from './_core.entry-test-support';

type CookieStore = { get: (name: string) => { value: string } | undefined };

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn<() => Promise<MockSession>>(async () => null),
  databaseSelectMock: vi.fn(),
  loginFormMock: vi.fn((_: unknown) => <div>login-form</div>),
  savedDraftSignInMock: vi.fn((_: unknown) => <div>saved-draft-sign-in</div>),
  redirectMock: vi.fn((_target: string) => {}),
  requestHeadersMock: vi.fn<() => Promise<Headers>>(async () => new Headers()),
  cookiesMock: vi.fn<() => Promise<CookieStore>>(async () => ({ get: () => undefined })),
  setRequestLocaleMock: vi.fn(),
}));

// Only request primitives, the session and external UI are mocked: exact host admission, the shared
// tenant resolver composition and the bootstrap helper all run for real.
vi.mock('next/headers', () => ({
  headers: hoisted.requestHeadersMock,
  cookies: hoisted.cookiesMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `auth.login.${key}`),
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/components/auth/login-form', () => ({
  LoginForm: (props: unknown) => hoisted.loginFormMock(props),
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
}));

vi.mock('@interdomestik/database/db', () => ({
  get db() {
    return { select: hoisted.databaseSelectMock };
  },
  get dbAdmin() {
    return { select: hoisted.databaseSelectMock };
  },
}));

vi.mock('./saved-draft-sign-in', () => ({
  SavedDraftSignInEntry: (props: unknown) => hoisted.savedDraftSignInMock(props),
}));

import LoginPage from './_core.entry';

const originalEnv = new Map<string, string | undefined>();
const FOREIGN_STALE_TENANT_COOKIE = 'tenant_al';

function setRequest(args: { host: string; forwardedHost?: string; tenantCookie?: string }): void {
  const bag: Record<string, string> = { host: args.host };
  if (args.forwardedHost !== undefined) bag['x-forwarded-host'] = args.forwardedHost;
  hoisted.requestHeadersMock.mockResolvedValue(new Headers(bag));

  const cookieStore: CookieStore = {
    get: name =>
      name === 'tenantId' && args.tenantCookie ? { value: args.tenantCookie } : undefined,
  };
  hoisted.cookiesMock.mockResolvedValue(cookieStore);
}

function submittedTenantId(): string | undefined {
  const props = hoisted.loginFormMock.mock.calls.at(0)?.[0] as { tenantId?: string } | undefined;
  return props?.tenantId;
}

beforeEach(() => {
  vi.clearAllMocks();
  snapshotNeutralHostEnv(originalEnv);
  setProductionNeutralHostEnv();
  hoisted.getSessionSafeMock.mockResolvedValue(null);
  hoisted.redirectMock.mockImplementation(throwNextRedirect);
  setRequest({ host: 'www.interdomestik.com' });
});

afterEach(() => restoreNeutralHostEnv(originalEnv));

describe('LoginPage on an exact admitted neutral host', () => {
  it.each([
    { host: 'interdomestik.com', legacyTenantId: 'tenant_ks' },
    { host: 'www.interdomestik.com', legacyTenantId: 'tenant_ks' },
    { host: 'app.interdomestik.com', legacyTenantId: 'tenant_ks' },
    { host: 'staging.interdomestik.com', legacyTenantId: 'tenant_ks' },
    { host: 'interdomestik-web.vercel.app', legacyTenantId: 'tenant_ks' },
    { host: 'ida.interdomestik.com', legacyTenantId: null },
  ])(
    'submits no implicit tenant for a no-hint login on $host',
    async ({ host, legacyTenantId }) => {
      setRequest({ host, tenantCookie: FOREIGN_STALE_TENANT_COOKIE });

      // The legacy resolver really does hand back a tenant on most of these hosts, which is exactly
      // what must not become an implicit sign-in hint.
      const legacyContext = await resolveTenantContextFromRequest();
      expect(legacyContext.tenantId).toBe(legacyTenantId);

      render(await renderLoginPage(LoginPage, {}));

      expect(submittedTenantId()).toBeUndefined();
      expect(hoisted.redirectMock).not.toHaveBeenCalled();
      expect(hoisted.databaseSelectMock).not.toHaveBeenCalled();
    }
  );

  it('ignores a foreign stale tenant cookie that the resolver would otherwise honour', async () => {
    // Outside a production build the resolver accepts the cookie, so the cookie hazard is real.
    setDevelopmentNeutralHostEnv();
    setRequest({ host: 'app.interdomestik.com', tenantCookie: FOREIGN_STALE_TENANT_COOKIE });

    const legacyContext = await resolveTenantContextFromRequest();
    expect(legacyContext).toMatchObject({ tenantId: 'tenant_al', source: 'cookie' });

    render(await renderLoginPage(LoginPage, {}));

    expect(submittedTenantId()).toBeUndefined();
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
  });

  it('keeps a validated tenant query on the URL for the form without a cookie bootstrap', async () => {
    setRequest({ host: 'www.interdomestik.com', tenantCookie: FOREIGN_STALE_TENANT_COOKIE });

    render(await renderLoginPage(LoginPage, { searchParams: { tenantId: 'tenant_mk' } }));

    expect(hoisted.redirectMock).not.toHaveBeenCalled();
    expect(submittedTenantId()).toBeUndefined();

    // The form resolves the deliberate request itself: explicit MK identity context, deferred social
    // onboarding intent.
    const query = new URLSearchParams('tenantId=tenant_mk');
    expect(resolveLoginTenantHint(query, submittedTenantId())).toBe('tenant_mk');
    expect(resolveSocialOnboardingTenantContext(query, submittedTenantId())).toEqual({
      tenantId: 'tenant_mk',
      deferred: true,
    });
  });

  it('never turns a booking query into password tenant context', async () => {
    setRequest({ host: 'staging.interdomestik.com' });

    // The page does not parse `default_booking_tenant_id` at all, so it can only reach the client.
    render(await renderLoginPage(LoginPage, {}));

    expect(submittedTenantId()).toBeUndefined();

    const query = new URLSearchParams('default_booking_tenant_id=tenant_mk');
    expect(resolveLoginTenantHint(query, submittedTenantId())).toBeUndefined();
    expect(resolveSocialOnboardingTenantContext(query, submittedTenantId())).toEqual({
      tenantId: 'tenant_mk',
      deferred: true,
    });
  });
});

describe('LoginPage outside exact neutral admission', () => {
  it.each([
    {
      name: 'a canonical host with an added port',
      request: { host: 'www.interdomestik.com:8443' },
    },
    {
      name: 'a comma-spliced forwarded host',
      request: {
        host: 'www.interdomestik.com',
        forwardedHost: 'www.interdomestik.com, evil.example',
      },
    },
  ])('retains the resolved context for $name', async ({ request }) => {
    setRequest(request);

    // A rejected neutral candidate is not an admitted entry, so nothing is dropped here; the sign-in
    // guard terminates such a request on its own.
    render(await renderLoginPage(LoginPage, {}));

    expect(submittedTenantId()).toBe('tenant_ks');
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
  });

  it.each([
    { host: 'ks.interdomestik.com', tenantId: 'tenant_ks' },
    { host: 'mk.localhost:3000', tenantId: 'tenant_mk' },
  ])('keeps the resolved country alias tenant on $host', async ({ host, tenantId }) => {
    setRequest({ host, tenantCookie: FOREIGN_STALE_TENANT_COOKIE });

    const legacyContext = await resolveTenantContextFromRequest();
    expect(legacyContext).toMatchObject({ tenantId, source: 'compatibility_alias' });

    render(await renderLoginPage(LoginPage, {}));

    expect(submittedTenantId()).toBe(tenantId);
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
  });

  it('keeps the country-alias mismatch bootstrap for an explicit other-tenant query', async () => {
    setRequest({ host: 'ks.interdomestik.com' });

    await expect(
      captureRedirect(LoginPage, { searchParams: { tenantId: 'tenant_mk' } })
    ).resolves.toBe('/en/login/tenant-context?tenantId=tenant_mk&next=%2Fen%2Flogin');
  });

  it('keeps the development loopback cookie context', async () => {
    setDevelopmentNeutralHostEnv();
    setRequest({ host: 'localhost:3000', tenantCookie: FOREIGN_STALE_TENANT_COOKIE });

    render(await renderLoginPage(LoginPage, {}));

    expect(submittedTenantId()).toBe('tenant_al');
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
  });
});
