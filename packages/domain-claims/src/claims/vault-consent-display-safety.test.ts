import { describe, expect, it } from 'vitest';

import { buildVaultConsentDisplay } from './vault-consent-display';
import { consent, evidenceDocument, input } from './vault-consent-display.test-support';

describe('buildVaultConsentDisplay safety', () => {
  it('does not expose a version for withdrawn or unsupported consent states', () => {
    const document = evidenceDocument();
    const withdrawn = consent({ status: 'withdrawn', privacyVersion: 'must-not-leak' });

    expect(
      buildVaultConsentDisplay(input({ documents: [document], consents: [withdrawn] }))
    ).toEqual({
      kind: 'ready',
      items: [
        {
          category: 'evidence',
          updatedAt: withdrawn.recordedAt,
          consentStatus: 'withdrawn',
          consentRecordedAt: withdrawn.recordedAt,
          consentVersion: null,
        },
      ],
    });
    expect(
      buildVaultConsentDisplay(
        input({ documents: [document], consents: [{ ...withdrawn, status: 'pending' }] })
      )
    ).toEqual({
      kind: 'ready',
      items: [
        {
          category: 'evidence',
          updatedAt: null,
          consentStatus: 'missing',
          consentRecordedAt: null,
          consentVersion: null,
        },
      ],
    });
  });

  it('returns only the allowlisted display fields', () => {
    const result = buildVaultConsentDisplay(
      input({ documents: [evidenceDocument({ id: 'secret-document-id' })] })
    );
    const serialized = JSON.stringify(result);

    for (const forbidden of [
      'secret-document-id',
      'documentId',
      'fileType',
      'fileSize',
      'filePath',
      'storagePath',
      'subjectId',
      'userId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
