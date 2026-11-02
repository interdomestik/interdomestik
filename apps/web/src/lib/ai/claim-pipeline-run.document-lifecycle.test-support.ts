import { vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

const mocks = vi.hoisted(() => {
  const where = vi.fn();
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const secondJoin = { where };
  const firstJoin = { innerJoin: vi.fn(() => secondJoin), where };
  const fromResult = { innerJoin: vi.fn(() => firstJoin) };
  const select = vi.fn(() => ({ from: vi.fn(() => fromResult) }));
  const ambientSelect = vi.fn();
  return {
    db: { select: ambientSelect },
    select,
    failDeletedDocumentClaimAiRun: vi.fn(),
    firstInnerJoin: fromResult.innerJoin,
    isNull: vi.fn((field: unknown) => ({ op: 'isNull', field })),
    secondInnerJoin: firstJoin.innerJoin,
    update,
    updateReturning,
    updateSet,
    updateWhere,
    withTenantContext: vi.fn(
      async (
        _context: unknown,
        callback: (tx: { select: typeof select; update: typeof update }) => unknown
      ) => await callback({ select, update })
    ),
    where,
  };
});
vi.mock('@/lib/db.server', () => ({ db: mocks.db }));
vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.withTenantContext }));
vi.mock('./claim-pipeline-document-lifecycle', () => ({
  failDeletedDocumentClaimAiRun: mocks.failDeletedDocumentClaimAiRun,
}));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {
    documentId: 'ai_runs.document_id',
    completedAt: 'ai_runs.completed_at',
    entityId: 'ai_runs.entity_id',
    entityType: 'ai_runs.entity_type',
    errorCode: 'ai_runs.error_code',
    id: 'ai_runs.id',
    requestedBy: 'ai_runs.requested_by',
    requestJson: 'ai_runs.request_json',
    status: 'ai_runs.status',
    tenantId: 'ai_runs.tenant_id',
    workflow: 'ai_runs.workflow',
  },
  claims: {
    category: 'claims.category',
    claimAmount: 'claims.claim_amount',
    currency: 'claims.currency',
    description: 'claims.description',
    id: 'claims.id',
    tenantId: 'claims.tenant_id',
    title: 'claims.title',
    userId: 'claims.user_id',
  },
  documents: {
    deletedAt: 'documents.deleted_at',
    fileName: 'documents.file_name',
    id: 'documents.id',
    mimeType: 'documents.mime_type',
    storagePath: 'documents.storage_path',
    tenantId: 'documents.tenant_id',
    uploadedAt: 'documents.uploaded_at',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  isNull: mocks.isNull,
}));
const authority = mintTestTenantAuthority('tenant_mk');

export { mocks, authority };
