import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { evidenceUploadErrorMessage } from './evidence-upload-error';
import { EVIDENCE_FORMAT_LABEL } from './evidence-file-policy';
import en from '@/messages/en/evidence.json';
import sq from '@/messages/sq/evidence.json';
import sr from '@/messages/sr/evidence.json';
import mk from '@/messages/mk/evidence.json';
import de from '@/messages/de/evidence.json';
import { ADMIN_NAMESPACES, APP_NAMESPACES, STAFF_NAMESPACES } from '@/i18n/messages';

vi.unmock('next-intl');
vi.mock('@/i18n/routing', () => ({ routing: { defaultLocale: 'en' } }));

describe('claim upload messages in every catalog', () => {
  it('makes shared evidence messages available in member, staff and admin shells', () => {
    for (const namespaces of [APP_NAMESPACES, STAFF_NAMESPACES, ADMIN_NAMESPACES]) {
      expect(namespaces).toContain('evidence');
    }
  });
  it.each(Object.entries({ en, sq, sr, mk, de }))(
    'uses matching keys and localized %s errors',
    (locale, messages) => {
      expect(Object.keys(messages.evidence.fileUpload).sort()).toEqual(
        Object.keys(en.evidence.fileUpload).sort()
      );
      const t = createTranslator({
        locale,
        messages,
        namespace: 'evidence.fileUpload',
        onError: error => {
          throw error;
        },
      });
      const copy = messages.evidence.fileUpload;
      expect(evidenceUploadErrorMessage('evidence_unsupported', t)).toBe(
        copy.unsupported.replace('{formats}', EVIDENCE_FORMAT_LABEL)
      );
      for (const limit of [4, 10, 50]) {
        expect(evidenceUploadErrorMessage('evidence_too_large', t, limit)).toBe(
          copy.tooLarge.replace('{limit}', String(limit))
        );
      }
      expect(evidenceUploadErrorMessage('evidence_empty', t)).toBe(copy.empty);
      expect(evidenceUploadErrorMessage(new Error('evidence_content_mismatch'), t)).toBe(
        copy.contentMismatch
      );
      for (const error of [new Error('storage provider private text'), 'Invalid file size', null]) {
        expect(evidenceUploadErrorMessage(error, t)).toBe(copy.failed);
      }
      if (locale !== 'en') expect(copy.failed).not.toBe(en.evidence.fileUpload.failed);
    }
  );
});
