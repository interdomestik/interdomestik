import { vi } from 'vitest';

// CRM repositories open their tenant transaction with withTenantAuthority, which reaches
// withTenantContext through the database package root. A test stands its double in for that
// transaction here instead of injecting it into the repository.
const tenantDatabase = vi.hoisted(() => ({
  contexts: [] as unknown[],
  current: undefined as unknown,
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: vi.fn((context: unknown, action: (tx: unknown) => unknown) => {
    tenantDatabase.contexts.push(context);
    return Promise.resolve(action(tenantDatabase.current));
  }),
}));

/** Makes `database` the tenant transaction the repository's calls open, and returns the
 * repository. */
export function onCrmTenantDatabase<TRepository>(
  database: unknown,
  repository: TRepository
): TRepository {
  tenantDatabase.current = database;
  return repository;
}

/** The contexts tenant transactions were opened with, in order. */
export function crmTenantContexts(): readonly unknown[] {
  return tenantDatabase.contexts;
}
