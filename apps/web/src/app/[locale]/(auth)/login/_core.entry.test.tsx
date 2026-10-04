import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  type MockSession,
  type MockTenantContext,
} from './_core.entry-test-support';

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn<() => Promise<MockSession>>(async () => null),
  // `localhost:3000` is never an admitted neutral host, so the mocked tenant context below stays
  // the value under test. Exact admitted hosts have their own suite.
  requestHeadersMock: vi.fn<() => Promise<Headers>>(
    async () => new Headers({ host: 'localhost:3000' })
  ),
  databaseSelectMock: vi.fn(),
  loginFormMock: vi.fn((_: unknown) => <div>login-form</div>),
  savedDraftSignInMock: vi.fn((_: unknown) => <div>saved-draft-sign-in</div>),
  redirectMock: vi.fn((_target: string) => {}),
  bootstrapRedirectMock: vi.fn<(args: unknown) => string | null>(() => null),
  resolveTenantContextFromRequestMock: vi.fn<() => Promise<MockTenantContext>>(async () => ({
    kind: 'tenant',
    tenantId: 'tenant_ks',
    source: 'compatibility_alias',
  })),
  setRequestLocaleMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `auth.login.${key}`),
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('next/headers', () => ({
  headers: hoisted.requestHeadersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('@/components/auth/login-form', () => ({
  LoginForm: (props: unknown) => hoisted.loginFormMock(props),
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
}));

vi.mock('@/lib/tenant/tenant-request', () => ({
  resolveTenantContextFromRequest: hoisted.resolveTenantContextFromRequestMock,
}));

vi.mock('./_core', async importOriginal => ({
  ...(await importOriginal<typeof import('./_core')>()),
  getLoginTenantBootstrapRedirect: hoisted.bootstrapRedirectMock,
}));

// Any tenant-directory access would have to come through the database handle; the neutral entry
// must never reach it.
vi.mock('@interdomestik/database/db', () => ({
  get db() {
    return { select: hoisted.databaseSelectMock };
  },
  get dbAdmin() {
    return { select: hoisted.databaseSelectMock };
  },
}));

// The server entry has its own host/tenant tests; this renderer mounts its resolved boundary.
vi.mock('./saved-draft-sign-in', () => ({
  SavedDraftSignInEntry: (props: unknown) => hoisted.savedDraftSignInMock(props),
}));

import LoginPage from './_core.entry';

const ENTRY_SOURCE_PATH = join(process.cwd(), 'src/app/[locale]/(auth)/login/_core.entry.tsx');

const originalEnv = new Map<string, string | undefined>();

describe('LoginPage neutral single entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotNeutralHostEnv(originalEnv);
    // An ambient configured host could otherwise make the request host an admitted neutral entry.
    clearNeutralHostOverrides();
    hoisted.getSessionSafeMock.mockResolvedValue(null);
    hoisted.bootstrapRedirectMock.mockReturnValue(null);
    hoisted.redirectMock.mockImplementation(throwNextRedirect);
    hoisted.requestHeadersMock.mockResolvedValue(new Headers({ host: NON_NEUTRAL_REQUEST_HOST }));
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValue(COUNTRY_ALIAS_CONTEXT);
  });

  afterEach(() => restoreNeutralHostEnv(originalEnv));

  it.each(['en', 'sq', 'mk', 'sr'])(
    'renders the %s portal shell with a single password form and no tenant chooser',
    async locale => {
      hoisted.resolveTenantContextFromRequestMock.mockResolvedValueOnce(PUBLIC_FRONT_DOOR_CONTEXT);

      render(await renderLoginPage(LoginPage, { locale }));

      expect(screen.getByTestId('auth-ready')).toBeInTheDocument();
      expect(screen.getByTestId('auth-portal-hero')).toHaveTextContent(
        'auth.login.portal.panelTitle'
      );
      expect(screen.getByTestId('auth-portal-form-region')).toBeInTheDocument();
      expect(screen.getByText('login-form')).toBeInTheDocument();
      expect(screen.queryByText('tenant-selector')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(hoisted.databaseSelectMock).not.toHaveBeenCalled();
      expect(hoisted.setRequestLocaleMock).toHaveBeenCalledExactlyOnceWith(locale);
      expect(hoisted.savedDraftSignInMock).toHaveBeenCalledWith({ locale });
      expect(hoisted.loginFormMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: undefined })
      );
      expect(hoisted.redirectMock).not.toHaveBeenCalled();
    }
  );

  it('does not reference a tenant directory or chooser in the login entry source', () => {
    const source = readFileSync(ENTRY_SOURCE_PATH, 'utf8');
    const forbiddenReferences = [
      'TenantSelector',
      'loadTenantOptions',
      'dbAdmin',
      'database/schema',
    ];

    for (const forbidden of forbiddenReferences) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('keeps carrying a deliberate host tenant context into the form', async () => {
    render(await renderLoginPage(LoginPage, {}));

    expect(hoisted.loginFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_ks' })
    );
    expect(hoisted.databaseSelectMock).not.toHaveBeenCalled();
  });

  it('leaves an explicit query tenant to the form instead of server-resolving it', async () => {
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValueOnce(PUBLIC_FRONT_DOOR_CONTEXT);

    render(await renderLoginPage(LoginPage, { searchParams: { tenantId: 'tenant_mk' } }));

    // The prop stays the server-resolved host/context tenant, so a neutral social sign-up keeps its
    // deferred onboarding intent. The validated `tenantId` request stays on the URL and the form
    // submits it as explicit context (see login-form-live-login-cutover.test.tsx).
    expect(hoisted.loginFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined })
    );
  });

  it('passes the single parsed query values into the tenant bootstrap decision', async () => {
    render(
      await renderLoginPage(LoginPage, {
        searchParams: {
          tenantId: 'tenant_mk',
          plan: 'family',
          next: '/en/member/claims/new',
        },
      })
    );

    expect(hoisted.bootstrapRedirectMock).toHaveBeenCalledExactlyOnceWith({
      locale: 'en',
      tenantIdFromQuery: 'tenant_mk',
      planIdFromQuery: 'family',
      nextPathFromQuery: '/en/member/claims/new',
      tenantIdFromContext: 'tenant_ks',
    });
  });

  it('follows a tenant bootstrap redirect before rendering', async () => {
    hoisted.bootstrapRedirectMock.mockReturnValue('/en/login/tenant-context?tenantId=tenant_mk');

    await expect(
      captureRedirect(LoginPage, { searchParams: { tenantId: 'tenant_mk' } })
    ).resolves.toBe('/en/login/tenant-context?tenantId=tenant_mk');
  });

  it('keeps portal login copy available in every supported locale', () => {
    const expectedKeys = [
      'eyebrow',
      'title',
      'subtitle',
      'panelTitle',
      'panelBody',
      'chipSecure',
      'chipStatus',
      'chipDocuments',
      'tenantTitle',
      'formRegionLabel',
    ];

    for (const locale of ['en', 'sq', 'mk', 'sr']) {
      const file = readFileSync(join(process.cwd(), 'src/messages', locale, 'auth.json'), 'utf8');
      const messages = JSON.parse(file) as {
        auth?: { login?: { portal?: Record<string, string> } };
      };

      const sortAlphabetically = (a: string, b: string): number => a.localeCompare(b);

      expect(Object.keys(messages.auth?.login?.portal ?? {}).sort(sortAlphabetically)).toEqual(
        [...expectedKeys].sort(sortAlphabetically)
      );
    }
  });
});
