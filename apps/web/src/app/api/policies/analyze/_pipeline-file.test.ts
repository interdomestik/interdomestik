import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const selectWhere = vi.fn();
  const selectInnerJoin = vi.fn(() => ({ where: selectWhere }));
  const selectFrom = vi.fn(() => ({ innerJoin: selectInnerJoin }));
  const select = vi.fn(() => ({ from: selectFrom }));

  return {
    db: { select },
    selectWhere,
  };
});

vi.mock('@/lib/db.server', () => ({ db: mocks.db }));
vi.mock('@interdomestik/database/schema', () => ({
  aiRuns: {
    documentId: 'ai_runs.document_id',
    id: 'ai_runs.id',
    status: 'ai_runs.status',
    tenantId: 'ai_runs.tenant_id',
  },
  documents: {
    deletedAt: 'documents.deleted_at',
    id: 'documents.id',
    tenantId: 'documents.tenant_id',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ args, op: 'and' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right, op: 'eq' })),
  isNull: vi.fn((field: unknown) => ({ field, op: 'isNull' })),
}));

import { loadPolicyInput } from './_pipeline-file';

const run = {
  runId: 'run-1',
  tenantId: 'tenant-1',
  documentId: 'doc-1',
  policyId: 'policy-1',
  storagePath: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
  requestJson: {
    fileName: 'file.pdf',
    fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
    mimeType: 'application/pdf',
  },
};

describe('loadPolicyInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectWhere.mockResolvedValue([{ id: 'run-1' }]);
  });

  it('rechecks active document state before downloading policy content', async () => {
    const deps = {
      downloadFile: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
      analyzeImage: vi.fn(),
      analyzePdf: vi.fn().mockResolvedValue('Parsed policy text'),
      analyzeText: vi.fn(),
    };

    await expect(loadPolicyInput(run, deps)).resolves.toMatchObject({
      fileUrl: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
      parsedText: 'Parsed policy text',
    });

    expect(mocks.selectWhere).toHaveBeenCalledOnce();
    expect(deps.downloadFile).toHaveBeenCalledWith(
      'pii/tenants/tenant-1/policies/user-1/file.pdf',
      'tenant-1'
    );
  });

  it('fails before download when the policy document is no longer active', async () => {
    mocks.selectWhere.mockResolvedValue([]);
    const deps = {
      downloadFile: vi.fn(),
      analyzeImage: vi.fn(),
      analyzePdf: vi.fn(),
      analyzeText: vi.fn(),
    };

    await expect(loadPolicyInput(run, deps)).rejects.toMatchObject({
      errorCode: 'document_ai_document_deleted',
    });

    expect(deps.downloadFile).not.toHaveBeenCalled();
    expect(deps.analyzePdf).not.toHaveBeenCalled();
    expect(deps.analyzeImage).not.toHaveBeenCalled();
  });
});
