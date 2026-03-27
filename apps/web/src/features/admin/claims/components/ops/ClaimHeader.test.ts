import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_FILE_ACCEPT,
  resolveStorageUploadContentType,
  resolveUploadMimeType,
} from './file-upload-meta';
import { formatClaimCreatedDate } from './claim-header-date';
import { buildAdminUserProfileHref } from './claim-header-links';

describe('buildAdminUserProfileHref', () => {
  it('always returns canonical admin user path without tenant query context', () => {
    const href = buildAdminUserProfileHref(
      'user-123',
      new URLSearchParams('tenantId=tenant_ks&lifecycle=processing')
    );

    expect(href).toBe('/admin/users/user-123');
  });
});

describe('resolveUploadMimeType', () => {
  it('falls back to extension-based mime types when browsers provide an empty type', () => {
    const file = new File(['dummy'], 'evidence.docx', { type: '' });

    expect(resolveUploadMimeType(file)).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });
});

describe('resolveStorageUploadContentType', () => {
  it('falls back to text/plain for storage-unsafe office containers', () => {
    const file = new File(['dummy'], 'evidence.docx', { type: '' });

    expect(resolveStorageUploadContentType(file)).toBe('text/plain');
  });

  it('falls back to text/plain for text-like business evidence', () => {
    const file = new File(['dummy'], 'thread.eml', { type: '' });

    expect(resolveStorageUploadContentType(file)).toBe('text/plain');
  });
});

describe('EVIDENCE_FILE_ACCEPT', () => {
  it('covers the wider business evidence set for office docs and recordings', () => {
    expect(EVIDENCE_FILE_ACCEPT).toContain('.xlsx');
    expect(EVIDENCE_FILE_ACCEPT).toContain('.mp4');
    expect(EVIDENCE_FILE_ACCEPT).toContain('.eml');
  });
});

describe('formatClaimCreatedDate', () => {
  it('formats MK claim dates with the active locale instead of English fallback', () => {
    expect(formatClaimCreatedDate(new Date('2025-12-30T00:00:00.000Z'), 'mk')).toContain(
      'декември'
    );
  });
});
