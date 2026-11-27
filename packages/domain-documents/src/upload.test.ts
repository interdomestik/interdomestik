import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertValues = vi.fn();
  const insert = vi.fn(() => ({ values: insertValues }));

  const selectWhere = vi.fn();
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  return {
    and: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'and' })),
    captureAudit: vi.fn(),
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: unknown) => unknown) =>
      callback({ insert, select })
    ),
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right, op: 'eq' })),
    insert,
    insertValues,
    isNull: vi.fn((value: unknown) => ({ op: 'isNull', value })),
    logAuditEvent: vi.fn(),
    nanoid: vi.fn(() => 'doc-123'),
    select,
    selectFrom,
    selectWhere,
  };
});

vi.mock('@interdomestik/database', () => ({
  withTenantContext: mocks.withTenantContext,
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

import { allocateStoragePath } from './storage';
import { getDocumentsForEntity, recordUpload } from './upload';

describe('document upload helpers', () => {
  const uploadMetadata = {
    entityType: 'claim',
    entityId: 'claim-1',
    fileName: 'Invoice Final.pdf',
    mimeType: 'application/pdf',
    fileSize: 512,
    uploadedBy: 'user-1',
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('records upload metadata and emits audit hooks', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const authority = mintTestTenantAuthority('tenant-1');

    await expect(
      recordUpload({
        authority,
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
      authority,
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
    const authority = mintTestTenantAuthority('tenant-1');

    await expect(
      getDocumentsForEntity({
        authority,
        entityType: 'claim',
        entityId: 'claim-1',
      })
    ).resolves.toEqual(docs);

    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
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

  it('rejects metadata for a completed upload whose legacy key would be respelled', async () => {
    await expect(
      recordUpload({
        authority: mintTestTenantAuthority('tenant-1'),
        entityType: 'claim',
        entityId: 'claim-1',
        fileName: 'Invoice Final.pdf',
        mimeType: 'application/pdf',
        fileSize: 512,
        uploadedBy: 'user-1',
      })
    ).rejects.toThrow('The existing upload key contains noncanonical characters.');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('records the exact allocated key and preserves the original filename', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const allocation = allocateStoragePath({
      ...uploadMetadata,
      tenantId: 'tenant-1',
    });
    const { storagePath } = allocation;
    expect(storagePath).toBe('tenant-1/claim/claim-1/1700000000000_Invoice_Final.pdf');
    clock.mockReturnValue(1_700_000_000_001);

    await expect(
      recordUpload({
        ...uploadMetadata,
        authority: mintTestTenantAuthority('tenant-1'),
        allocation,
      })
    ).resolves.toEqual({ documentId: 'doc-123', storagePath });

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ storagePath, fileName: uploadMetadata.fileName })
    );
  });

  it.each([
    { tenantId: 'tenant-2' },
    { entityType: 'policy' },
    { entityId: 'claim-2' },
    { fileName: 'Invoice_Final.pdf' },
  ])('rejects a genuine allocation issued for different coordinates: %j', async coordinates => {
    const allocation = allocateStoragePath({
      ...uploadMetadata,
      tenantId: 'tenant-1',
      ...coordinates,
    });

    await expect(
      recordUpload({
        ...uploadMetadata,
        authority: mintTestTenantAuthority('tenant-1'),
        allocation,
      })
    ).rejects.toThrow('The storage allocation must be issued for this upload.');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    'tenant-1/claim/claim-1/1700000000001_Invoice_Final.pdf',
    'tenant-1/claim/claim-1/1700000000000_Invoice Final.pdf',
    'tenant-1/claim/claim-1/nested/1700000000000_Invoice_Final.pdf',
    'tenant-1/claim/claim-1/01700000000000_Invoice_Final.pdf',
  ])('rejects a copy of the allocation with a changed key: %s', async storagePath => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const allocation = allocateStoragePath({ ...uploadMetadata, tenantId: 'tenant-1' });
    expect(allocation.storagePath).toBe('tenant-1/claim/claim-1/1700000000000_Invoice_Final.pdf');

    await expect(
      recordUpload({
        ...uploadMetadata,
        authority: mintTestTenantAuthority('tenant-1'),
        allocation: { ...allocation, storagePath },
      })
    ).rejects.toThrow('The storage allocation must be issued for this upload.');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(mocks.captureAudit).not.toHaveBeenCalled();
  });

  it('rejects a raw key with a changed timestamp before recording legacy metadata', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const upload = { ...uploadMetadata, fileName: 'Invoice_Final.pdf' };
    const allocation = allocateStoragePath({ ...upload, tenantId: 'tenant-1' });
    const rawUpload = {
      ...upload,
      authority: mintTestTenantAuthority('tenant-1'),
      storagePath: allocation.storagePath.replace('1700000000000_', '1700000000001_'),
    };
    expect(Reflect.set(allocation, 'storagePath', rawUpload.storagePath)).toBe(false);

    await expect(recordUpload(rawUpload)).rejects.toThrow('Pass the original storage allocation');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(mocks.captureAudit).not.toHaveBeenCalled();
  });

  it('preserves the display name when the legacy allocation is already canonical', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    await recordUpload({
      authority: mintTestTenantAuthority('tenant-1'),
      entityType: 'claim',
      entityId: 'claim-1',
      fileName: 'old\\invoice.pdf',
      mimeType: 'application/pdf',
      fileSize: 512,
      uploadedBy: 'user-1',
    });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: 'tenant-1/claim/claim-1/1700000000000_old_invoice.pdf',
        fileName: 'old\\invoice.pdf',
      })
    );
  });
});
