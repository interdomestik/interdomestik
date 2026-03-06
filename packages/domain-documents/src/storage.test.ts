import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildStoragePath,
  buildStorageUrl,
  extractTenantFromPath,
  getDocumentBucket,
  validateTenantOwnership,
} from './storage';

describe('document storage helpers', () => {
  beforeEach(() => {
    delete process.env.DOCUMENT_STORAGE_BUCKET;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    vi.restoreAllMocks();
  });

  it('builds a tenant-isolated storage path and sanitizes the file name', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    expect(
      buildStoragePath({
        tenantId: 'tenant-1',
        entityType: 'claim',
        entityId: 'claim-1',
        fileName: '../invoice.pdf',
      })
    ).toBe('tenant-1/claim/claim-1/1700000000000___invoice.pdf');
  });

  it('validates and extracts tenant ownership from storage paths', () => {
    const storagePath = 'tenant-1/claim/claim-1/1700000000000_invoice.pdf';

    expect(validateTenantOwnership(storagePath, 'tenant-1')).toBe(true);
    expect(validateTenantOwnership(storagePath, 'tenant-2')).toBe(false);
    expect(extractTenantFromPath(storagePath)).toBe('tenant-1');
    expect(extractTenantFromPath('invalid/path')).toBeNull();
  });

  it('builds storage URLs using configured bucket and base URL', () => {
    process.env.DOCUMENT_STORAGE_BUCKET = 'claim-evidence';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';

    expect(getDocumentBucket()).toBe('claim-evidence');
    expect(buildStorageUrl('tenant-1/claim/claim-1/file.pdf')).toBe(
      'https://example.supabase.co/storage/v1/object/public/claim-evidence/tenant-1/claim/claim-1/file.pdf'
    );
  });

  it('falls back to the default bucket when no env override exists', () => {
    expect(getDocumentBucket()).toBe('documents');
  });
});
