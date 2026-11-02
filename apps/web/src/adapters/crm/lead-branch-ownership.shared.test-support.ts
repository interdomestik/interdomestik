import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import { actor } from './lead-branch-ownership.test-support';
import { createCrmLeadMutationRepository } from './lead-mutation-repository';

const mocks = await vi.hoisted(async () => {
  const { createOwnershipMocks } = await import('./lead-branch-ownership.test-support');
  return createOwnershipMocks();
});
vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  asc: mocks.asc,
  eq: mocks.eq,
  inArray: mocks.inArray,
  isNull: mocks.isNull,
  sql: mocks.sql,
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));
vi.mock(
  '@interdomestik/database/schema',
  async () => (await import('./lead-branch-ownership.test-support')).schemaMock
);
vi.mock('@interdomestik/database', async () => {
  const { db } = await import('@interdomestik/database/db');
  mocks.withTenantContext.mockImplementation(
    async (_context: unknown, callback: (tx: unknown) => unknown) => callback(db)
  );
  return { withTenantContext: mocks.withTenantContext };
});
vi.mock('@interdomestik/database/db', () => ({
  db: {
    execute: vi.fn(),
    insert: mocks.insert,
    query: {
      branches: {
        findFirst: mocks.branchFindFirst,
      },
      crmLeads: {
        findFirst: mocks.crmLeadFindFirst,
      },
      user: {
        findFirst: mocks.userFindFirst,
      },
    },
    select: vi.fn(),
    transaction: mocks.transaction,
    update: mocks.update,
  },
}));
const crmLeadMutationRepository = createCrmLeadMutationRepository(
  mintTestTenantAuthority(actor.tenantId)
);

export { mocks, crmLeadMutationRepository };
