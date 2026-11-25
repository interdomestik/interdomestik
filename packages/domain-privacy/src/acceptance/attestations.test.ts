import { describe, expect, it } from 'vitest';

import { validateAttestations } from './attestations';
import { currentLegalVersions } from './current-versions';

const terms = { kind: 'terms', version: currentLegalVersions.terms } as const;
const privacy = { kind: 'privacy_notice', version: currentLegalVersions.privacy_notice } as const;

describe('validateAttestations', () => {
  it('accepts exactly the missing document and its own affirmative attestation', () => {
    expect(
      validateAttestations([privacy], {
        documents: [privacy],
        attestations: { privacyNoticeAcknowledged: true },
      })
    ).toBeNull();
    expect(
      validateAttestations([privacy], {
        documents: [privacy],
        attestations: { privacyNoticeAcknowledged: true, termsAccepted: true },
      })
    ).toBe('invalid_attestations');
  });

  it('refuses stale versions and a changed set of missing documents', () => {
    expect(
      validateAttestations([terms], {
        documents: [{ ...terms, version: 'previous' }],
        attestations: { termsAccepted: true },
      })
    ).toBe('stale_version');
    expect(
      validateAttestations([terms, privacy], {
        documents: [privacy],
        attestations: { privacyNoticeAcknowledged: true },
      })
    ).toBe('stale_version');
  });

  it('refuses duplicate documents', () => {
    expect(
      validateAttestations([terms, privacy], {
        documents: [terms, terms],
        attestations: { termsAccepted: true, privacyNoticeAcknowledged: true },
      })
    ).toBe('stale_version');
  });
});
