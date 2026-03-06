import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertValues = vi.fn();
  const insert = vi.fn(() => ({ values: insertValues }));

  const selectWhere = vi.fn();
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  const updateWhere = vi.fn();
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    and: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'and' })),
    captureAudit: vi.fn(),
    db: { insert, select, update },
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right, op: 'eq' })),
    insert,
    insertValues,
    isNull: vi.fn((value: unknown) => ({ op: 'isNull', value })),
    logAuditEvent: vi.fn(),
    nanoid: vi.fn(() => 'doc-123'),
    select,
    selectFrom,
    selectWhere,
    update,
    updateSet,
    updateWhere,
  };
});

vi.mock('@interdomestik/database/db', () => ({
  db: mocks.db,
}));

vi.mock('@interdomestik/database/schema', () => ({
  documents: {
    deletedAt: 'documents.deletedAt',
    entityId: 'documents.entityId',
    entityType: 'documents.entityType',
    id: 'documents.id',
    tenantId: 'documents.tenantId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  eq: mocks.eq,
  isNull: mocks.isNull,
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

vi.mock('./audit', () => ({
  captureAudit: mocks.captureAudit,
  logAuditEvent: mocks.logAuditEvent,
}));

import { getDocumentsForEntity, recordUpload, softDeleteDocument } from './upload';

describe('document upload helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('records upload metadata and emits audit hooks', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    await expect(
      recordUpload({
        tenantId: 'tenant-1',
        entityType: 'claim',
        entityId: 'claim-1',
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        fileSize: 512,
        uploadedBy: 'user-1',
      })
    ).resolves.toEqual({
      documentId: 'doc-123',
      storagePath: 'tenant-1/claim/claim-1/1700000000000_invoice.pdf',
    });

    expect(mocks.insert).toHaveBeenCalledWith({
      deletedAt: 'documents.deletedAt',
      entityId: 'documents.entityId',
      entityType: 'documents.entityType',
      id: 'documents.id',
      tenantId: 'documents.tenantId',
    });
    expect(mocks.insertValues).toHaveBeenCalledWith({
      id: 'doc-123',
      tenantId: 'tenant-1',
      entityType: 'claim',
      entityId: 'claim-1',
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      fileSize: 512,
      storagePath: 'tenant-1/claim/claim-1/1700000000000_invoice.pdf',
      category: 'other',
      description: null,
      uploadedBy: 'user-1',
      uploadedAt: expect.any(Date),
    });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      documentId: 'doc-123',
      accessType: 'upload',
      accessedBy: 'user-1',
    });
    expect(mocks.captureAudit).toHaveBeenCalledWith('upload', {
      tenantId: 'tenant-1',
      documentId: 'doc-123',
      entityType: 'claim',
      entityId: 'claim-1',
      fileName: 'invoice.pdf',
      fileSize: 512,
      uploadedBy: 'user-1',
    });
  });

  it('returns tenant-scoped documents for an entity', async () => {
    const docs = [{ id: 'doc-1' }, { id: 'doc-2' }];
    mocks.selectWhere.mockResolvedValueOnce(docs);

    await expect(
      getDocumentsForEntity({
        tenantId: 'tenant-1',
        entityType: 'claim',
        entityId: 'claim-1',
      })
    ).resolves.toEqual(docs);

    expect(mocks.select).toHaveBeenCalled();
    expect(mocks.selectFrom).toHaveBeenCalledWith({
      deletedAt: 'documents.deletedAt',
      entityId: 'documents.entityId',
      entityType: 'documents.entityType',
      id: 'documents.id',
      tenantId: 'documents.tenantId',
    });
    expect(mocks.selectWhere).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes tenant-scoped documents and logs the deletion', async () => {
    await softDeleteDocument({
      tenantId: 'tenant-1',
      documentId: 'doc-1',
      deletedBy: 'admin-1',
    });

    expect(mocks.update).toHaveBeenCalledWith({
      deletedAt: 'documents.deletedAt',
      entityId: 'documents.entityId',
      entityType: 'documents.entityType',
      id: 'documents.id',
      tenantId: 'documents.tenantId',
    });
    expect(mocks.updateSet).toHaveBeenCalledWith({
      deletedAt: expect.any(Date),
      deletedBy: 'admin-1',
    });
    expect(mocks.updateWhere).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      documentId: 'doc-1',
      accessType: 'delete',
      accessedBy: 'admin-1',
    });
  });
});
