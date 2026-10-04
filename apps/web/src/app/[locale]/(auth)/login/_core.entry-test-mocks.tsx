import { vi } from 'vitest';

import type { MockSession, MockTenantContext } from './_core.entry-test-support';

// Import this module before the entry component so both suites register the same boundaries.
// Keep the hoisted binding local: Vitest does not support exporting a hoisted declaration.
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

export function getLoginEntryMocks() {
  return hoisted;
}
