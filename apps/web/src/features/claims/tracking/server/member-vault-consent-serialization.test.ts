import { describe, expect, it } from 'vitest';

import { serializeMemberVaultConsentDisplay } from './member-vault-consent-serialization';

describe('serializeMemberVaultConsentDisplay', () => {
  it('preserves item-free hidden and erased states', () => {
    expect(serializeMemberVaultConsentDisplay({ kind: 'hidden' })).toEqual({ kind: 'hidden' });
    const erased = serializeMemberVaultConsentDisplay({ kind: 'subject_erased' });
    expect(erased).toEqual({ kind: 'subject_erased' });
    expect('items' in erased).toBe(false);
  });

  it('serializes only the allowlisted display dates', () => {
    const unsafeRuntimeDisplay = {
      kind: 'ready',
      items: [
        {
          category: 'evidence',
          updatedAt: new Date('2026-07-05T10:00:00Z'),
          consentStatus: 'accepted',
          consentRecordedAt: new Date('2026-07-04T09:00:00Z'),
          consentVersion: 'privacy-2026-07',
          id: 'forbidden-document-id',
          name: 'forbidden-document-name.pdf',
          filePath: '/forbidden/storage/path',
          subjectId: 'forbidden-subject-id',
        },
      ],
    } as unknown as Parameters<typeof serializeMemberVaultConsentDisplay>[0];
    const result = serializeMemberVaultConsentDisplay(unsafeRuntimeDisplay);

    expect(result).toEqual({
      kind: 'ready',
      items: [
        {
          category: 'evidence',
          updatedAt: '2026-07-05T10:00:00.000Z',
          consentStatus: 'accepted',
          consentRecordedAt: '2026-07-04T09:00:00.000Z',
          consentVersion: 'privacy-2026-07',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /forbidden|"(?:id|name|path|file|subject|user)"\s*:/i
    );
  });
});
