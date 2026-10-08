import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class NavigationSignal extends Error {
    constructor(readonly target: string) {
      super(target);
    }
  }
  return {
    NavigationSignal,
    getSession: vi.fn(),
    withTenantContext: vi.fn(),
    txFindFirst: vi.fn(),
    importedFindFirst: vi.fn(),
  };
});

// Registered when this module is evaluated, so import it before the page under test.
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new mocks.NavigationSignal(`redirect:${url}`);
  },
  notFound: () => {
    throw new mocks.NavigationSignal('notFound');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: { findFirst: mocks.importedFindFirst },
      user: { findFirst: mocks.importedFindFirst },
    },
  },
  withTenantContext: mocks.withTenantContext,
}));

export const tx = {
  query: {
    claims: { findFirst: mocks.txFindFirst },
    user: { findFirst: mocks.txFindFirst },
  },
};

export function session(user: Record<string, unknown> = {}) {
  return {
    session: { id: 'session-1' },
    user: {
      id: 'admin-1',
      role: 'tenant_admin',
      tenantId: 'tenant-home',
      accessTenantId: 'tenant-access',
      ...user,
    },
  };
}

/** Clears every mock, then restores the defaults: admin session, real callback tx, found row. */
export function resetResolverMocks(foundRow: { id: string }): void {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session());
  mocks.withTenantContext.mockImplementation(
    async (_context: unknown, action: (t: typeof tx) => Promise<unknown>) => action(tx)
  );
  mocks.txFindFirst.mockResolvedValue(foundRow);
}

/** Resolves with the navigation target; rethrows anything that is not a navigation signal. */
export async function runNavigation(render: () => Promise<unknown>): Promise<string> {
  try {
    await render();
  } catch (error) {
    if (error instanceof mocks.NavigationSignal) return error.target;
    throw error;
  }
  throw new Error('resolver returned without navigating');
}

export function expectTenantContext(tenantId: string, role: string): void {
  expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({ tenantId, role });
}

/** Registers the failure cases that are identical for every number resolver page. */
export function itFailsClosedAndPropagatesErrors(navigate: () => Promise<string>): void {
  it('fails closed without a lookup when the session has no tenant scope', async () => {
    mocks.getSession.mockResolvedValue(session({ tenantId: null, accessTenantId: null }));
    await expect(navigate()).rejects.toThrow();
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('propagates unexpected database failures instead of notFound', async () => {
    mocks.txFindFirst.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(navigate()).rejects.toThrow('connection terminated');
  });

  it('propagates tenant-context failures without querying', async () => {
    mocks.withTenantContext.mockRejectedValueOnce(new Error('rls role not ready'));
    await expect(navigate()).rejects.toThrow('rls role not ready');
    expect(mocks.txFindFirst).not.toHaveBeenCalled();
  });
}

export { mocks };
