import { describe, expect, it } from 'vitest';

import { buildVaultConsentDisplay } from './vault-consent-display';
import { consent, evidenceDocument, input } from './vault-consent-display.test-support';

describe('buildVaultConsentDisplay selection', () => {
  it('allows only evidence documents into the safe display', () => {
    const evidence = evidenceDocument({ createdAt: new Date('2026-07-01Z') });
    const result = buildVaultConsentDisplay(
      input({
        documents: [
          evidence,
          { id: 'legal-1', category: 'legal', createdAt: new Date('2026-07-02Z') },
          { id: 'medical-1', category: 'medical', createdAt: new Date('2026-07-03Z') },
          { id: 'other-1', category: 'other', createdAt: new Date('2026-07-04Z') },
        ],
      })
    );

    expect(result).toEqual({
      kind: 'ready',
      items: [
        {
          category: 'evidence',
          updatedAt: evidence.createdAt,
          consentStatus: 'missing',
          consentRecordedAt: null,
          consentVersion: null,
        },
      ],
    });
  });

  it('selects the latest exact AI extraction consent with an id tie-break', () => {
    const recordedAt = new Date('2026-07-05T10:00:00Z');
    const result = buildVaultConsentDisplay(
      input({
        documents: [evidenceDocument()],
        consents: [
          consent({
            id: 'wrong-type',
            consentType: 'general',
            recordedAt: new Date('2026-07-06Z'),
          }),
          consent({
            id: 'wrong-purpose',
            processingPurpose: 'general',
            recordedAt: new Date('2026-07-06Z'),
          }),
          consent({ id: 'consent-1', status: 'withdrawn', recordedAt }),
          consent({ id: 'consent-2', recordedAt }),
        ],
      })
    );

    expect(result).toEqual({
      kind: 'ready',
      items: [
        {
          category: 'evidence',
          updatedAt: recordedAt,
          consentStatus: 'accepted',
          consentRecordedAt: recordedAt,
          consentVersion: 'privacy-2026-07',
        },
      ],
    });
  });
});
