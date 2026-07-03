import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const deleteWhere = vi.fn();
  const deleteFrom = vi.fn(() => ({ where: deleteWhere }));
  const updateWhere = vi.fn();
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const tx = { delete: deleteFrom, update };

  return {
    and: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'and' })),
    db: { transaction: vi.fn(async (callback: (txArg: typeof tx) => unknown) => callback(tx)) },
    deleteFrom,
    deleteWhere,
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right, op: 'eq' })),
    inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, op: 'inArray', values })),
    logAuditEvent: vi.fn(),
    tx,
    update,
    updateSet,
    updateWhere,
  };
});

vi.mock('@interdomestik/database/db', () => ({ db: mocks.db }));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {
    completedAt: 'ai_runs.completed_at',
    documentId: 'ai_runs.document_id',
    entityType: 'ai_runs.entity_type',
    errorCode: 'ai_runs.error_code',
    errorMessage: 'ai_runs.error_message',
    outputJson: 'ai_runs.output_json',
    requestJson: 'ai_runs.request_json',
    responseJson: 'ai_runs.response_json',
    status: 'ai_runs.status',
    tenantId: 'ai_runs.tenant_id',
  },
  documentExtractions: {
    documentId: 'document_extractions.document_id',
    tenantId: 'document_extractions.tenant_id',
  },
  documents: {
    deletedAt: 'documents.deleted_at',
    deletedBy: 'documents.deleted_by',
    id: 'documents.id',
    tenantId: 'documents.tenant_id',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  eq: mocks.eq,
  inArray: mocks.inArray,
}));
vi.mock('./audit', () => ({ logAuditEvent: mocks.logAuditEvent }));

import { softDeleteDocument } from './document-lifecycle';

describe('softDeleteDocument', () => {
  beforeEach(() => vi.clearAllMocks());

  it('soft-deletes the document and clears AI-derived data for the tenant document', async () => {
    await softDeleteDocument({
      tenantId: 'tenant-1',
      documentId: 'doc-1',
      deletedBy: 'admin-1',
    });

    expect(mocks.db.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenNthCalledWith(1, {
      deletedAt: 'documents.deleted_at',
      deletedBy: 'documents.deleted_by',
      id: 'documents.id',
      tenantId: 'documents.tenant_id',
    });
    expect(mocks.deleteFrom).toHaveBeenCalledWith({
      documentId: 'document_extractions.document_id',
      tenantId: 'document_extractions.tenant_id',
    });
    expect(mocks.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ documentId: 'ai_runs.document_id' })
    );
    expect(mocks.updateSet).toHaveBeenNthCalledWith(2, {
      requestJson: {},
      outputJson: null,
      responseJson: null,
    });
    expect(mocks.updateSet).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        status: 'failed',
        errorCode: 'claim_ai_document_deleted',
        requestJson: {},
        outputJson: null,
        responseJson: null,
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('ai_runs.entity_type', 'claim');
    expect(mocks.inArray).toHaveBeenCalledWith('ai_runs.status', [
      'queued',
      'processing',
      'in_progress',
    ]);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      documentId: 'doc-1',
      accessType: 'delete',
      accessedBy: 'admin-1',
    });
  });
});
