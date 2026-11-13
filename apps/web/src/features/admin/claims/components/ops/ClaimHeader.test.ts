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
  it('keeps the canonical Office MIME for signed storage uploads', () => {
    const file = new File(['dummy'], 'evidence.docx', { type: '' });

    expect(resolveStorageUploadContentType(file)).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it.each([
    ['eml', 'message/rfc822'],
    ['msg', 'application/vnd.ms-outlook'],
  ])('resolves the canonical .%s email MIME when the browser omits it', (ext, mimeType) => {
    const file = new File(['dummy'], `thread.${ext}`, { type: '' });

    expect(resolveStorageUploadContentType(file)).toBe(mimeType);
  });

  it('refuses unsupported executable evidence without a fallback MIME', () => {
    const file = new File(['dummy'], 'thread.exe', { type: '' });

    expect(resolveStorageUploadContentType(file)).toBe('');
  });
});

describe('EVIDENCE_FILE_ACCEPT', () => {
  it('advertises only approved documents and recordings', () => {
    expect(EVIDENCE_FILE_ACCEPT).toContain('.xlsx');
    expect(EVIDENCE_FILE_ACCEPT).toContain('.mp4');
    expect(EVIDENCE_FILE_ACCEPT).toContain('.eml');
    expect(EVIDENCE_FILE_ACCEPT).toContain('.msg');
    expect(EVIDENCE_FILE_ACCEPT).not.toContain('.exe');
  });
});

describe('formatClaimCreatedDate', () => {
  it('formats MK claim dates with the active locale instead of English fallback', () => {
    expect(formatClaimCreatedDate(new Date('2025-12-30T00:00:00.000Z'), 'mk')).toContain(
      'декември'
    );
  });

  it('formats DE claim dates in German instead of the English fallback', () => {
    expect(formatClaimCreatedDate(new Date('2025-12-30T12:00:00.000Z'), 'de')).toContain(
      'Dezember'
    );
  });

  it.each([
    ['sr', '12. decembar 2025.'],
    ['sq', '12 Dhjetor 2025'],
    ['de', '12. Dezember 2025'],
    ['en', 'December 12, 2025'],
  ])('formats %s claim dates day-first in the app script', (locale, expected) => {
    expect(formatClaimCreatedDate('2025-12-12T10:00:00.000Z', locale)).toBe(expected);
  });

  it('keeps the pilot calendar day in every host time zone', () => {
    const original = process.env.TZ;
    try {
      for (const zone of ['Pacific/Auckland', 'Pacific/Kiritimati', 'America/Los_Angeles', 'UTC']) {
        process.env.TZ = zone;
        expect(formatClaimCreatedDate('2025-12-12T10:00:00.000Z', 'sq')).toBe('12 Dhjetor 2025');
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it('uses the pilot-zone calendar day and tolerates missing values', () => {
    expect(formatClaimCreatedDate('2025-12-12T23:30:00.000Z', 'sq')).toBe('13 Dhjetor 2025');
    expect(formatClaimCreatedDate(null, 'sq')).toBe('');
  });
});
