import { vi } from 'vitest';

// The relative index import can reach the real tenant module under Vitest.
// Route its runner to the test's package-root mock beneath the real authority check.
vi.mock('@interdomestik/database/tenant', async importOriginal => {
  const actual =
    await importOriginal<Pick<typeof import('@interdomestik/database'), 'withTenantContext'>>();
  const withTenantContext: typeof actual.withTenantContext = async (context, action) => {
    const root = await import('@interdomestik/database');
    if (root.withTenantContext === withTenantContext)
      throw new Error('Missing transaction runner mock');
    return root.withTenantContext(context, action);
  };
  return { ...actual, withTenantContext };
});
