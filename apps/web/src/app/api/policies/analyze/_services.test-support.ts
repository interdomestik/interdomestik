import { vi } from 'vitest';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

const mocks = vi.hoisted(() => {
  const txInsertOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const txInsertValues = vi.fn();
  const txInsertReturning = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txUpdateReturning = vi.fn();
  const txUpdateWhere = vi.fn((..._predicate: unknown[]) => ({
    returning: txUpdateReturning,
  }));
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txExecute = vi.fn();
  type Tx = {
    execute: typeof txExecute;
    insert: typeof txInsert;
    select: typeof select;
    update: typeof txUpdate;
  };
  const transaction = vi.fn(async (callback: (tx: Tx) => Promise<unknown>) =>
    callback({ execute: txExecute, insert: txInsert, select, update: txUpdate })
  );

  const selectWhere = vi.fn();
  const selectInnerJoin = vi.fn(() => ({ where: selectWhere }));
  const selectFrom = vi.fn(() => ({ innerJoin: selectInnerJoin, where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    authorizeInngestEventTenant: vi.fn(),
    createAdminClient: vi.fn(),
    db: {
      select,
      transaction,
      update,
    },
    nanoid: vi.fn(),
    select,
    selectFrom,
    selectInnerJoin,
    selectWhere,
    transaction,
    txInsert,
    txInsertOnConflictDoNothing,
    txInsertReturning,
    txInsertValues,
    txExecute,
    txUpdate,
    txUpdateReturning,
    txUpdateSet,
    txUpdateWhere,
    updateReturning,
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: Tx) => Promise<unknown>) =>
      callback({ execute: txExecute, insert: txInsert, select, update: txUpdate })
    ),
  };
});
vi.mock('@/lib/db.server', () => ({
  db: mocks.db,
}));
vi.mock('@interdomestik/database', () => ({
  authorizeInngestEventTenant: mocks.authorizeInngestEventTenant,
  createAdminClient: mocks.createAdminClient,
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  withTenantContext: mocks.withTenantContext,
}));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {
    __name: 'ai_runs',
    errorCode: {},
    id: {},
    status: {},
    tenantId: { __name: 'ai_runs.tenant_id' },
  },
  documentExtractions: {
    __name: 'document_extractions',
    sourceRunId: { __name: 'document_extractions.source_run_id' },
  },
  documents: {
    __name: 'documents',
    deletedAt: { __name: 'documents.deleted_at' },
    id: { __name: 'documents.id' },
    tenantId: { __name: 'documents.tenant_id' },
  },
  policies: { __name: 'policies' },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ __op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ __op: 'eq', left, right })),
  isNull: vi.fn((field: unknown) => ({ __op: 'isNull', field })),
}));
vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));
const authorities = new Map<string, ReturnType<typeof mintTestTenantAuthority>>();
function authorityFor(tenantId: string) {
  let authority = authorities.get(tenantId);
  if (!authority) {
    authority = mintTestTenantAuthority(tenantId);
    authorities.set(tenantId, authority);
  }
  return authority;
}
const ingress = Object.freeze({}) as unknown as IngressCapability<'inngest'>;

export { mocks, authorities, authorityFor, ingress };
