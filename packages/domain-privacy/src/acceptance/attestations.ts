import type { LegalDocument } from './documents';

export type LegalAcceptanceSubmission = {
  documents: readonly LegalDocument[];
  attestations: { termsAccepted?: true; privacyNoticeAcknowledged?: true };
};

export function validateAttestations(
  missing: readonly LegalDocument[],
  input: LegalAcceptanceSubmission
) {
  if (
    missing.length !== input.documents.length ||
    !missing.every(doc =>
      input.documents.some(value => value.kind === doc.kind && value.version === doc.version)
    )
  ) {
    return 'stale_version';
  }

  const termsRequired = missing.some(doc => doc.kind === 'terms');
  const privacyRequired = missing.some(doc => doc.kind === 'privacy_notice');
  if (
    termsRequired !== (input.attestations.termsAccepted === true) ||
    privacyRequired !== (input.attestations.privacyNoticeAcknowledged === true)
  ) {
    return 'invalid_attestations';
  }
  return null;
}
