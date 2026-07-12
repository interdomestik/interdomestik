export interface VaultConsentDocumentSource {
  id: string;
  category: string;
  createdAt: Date | null;
}

export interface VaultConsentSource {
  id: string;
  documentId: string;
  consentType: string;
  processingPurpose: string;
  status: string;
  recordedAt: Date;
  privacyVersion: string;
}

export interface VaultConsentDisplayInput {
  tenantCode: string | null;
  tenantCountryCode: string | null;
  claimCategory: string;
  piiStatus: 'available' | 'erased_or_unavailable';
  documents: VaultConsentDocumentSource[];
  consents: VaultConsentSource[];
}

export interface VaultConsentDisplayItem {
  category: 'evidence';
  updatedAt: Date | null;
  consentStatus: 'accepted' | 'withdrawn' | 'missing';
  consentRecordedAt: Date | null;
  consentVersion: string | null;
}

export type VaultConsentDisplay =
  | { kind: 'hidden' }
  | { kind: 'subject_erased' }
  | { kind: 'ready'; items: VaultConsentDisplayItem[] };

function isExactAiExtractionConsent(
  consent: VaultConsentSource
): consent is VaultConsentSource & { status: 'accepted' | 'withdrawn' } {
  return (
    consent.consentType === 'ai_document_extraction' &&
    consent.processingPurpose === 'ai_document_extraction' &&
    (consent.status === 'accepted' || consent.status === 'withdrawn')
  );
}

function compareLatest(left: VaultConsentSource, right: VaultConsentSource): number {
  const timeDifference = right.recordedAt.getTime() - left.recordedAt.getTime();
  return timeDifference || right.id.localeCompare(left.id);
}

function latestConsentForDocument(
  documentId: string,
  consents: VaultConsentSource[]
): VaultConsentSource | undefined {
  return consents
    .filter(consent => consent.documentId === documentId && isExactAiExtractionConsent(consent))
    .sort(compareLatest)[0];
}

function latestDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}

function toDisplayItem(
  document: VaultConsentDocumentSource,
  consents: VaultConsentSource[]
): VaultConsentDisplayItem {
  const consent = latestConsentForDocument(document.id, consents);
  if (!consent) {
    return {
      category: 'evidence',
      updatedAt: document.createdAt,
      consentStatus: 'missing',
      consentRecordedAt: null,
      consentVersion: null,
    };
  }
  return {
    category: 'evidence',
    updatedAt: latestDate(document.createdAt, consent.recordedAt),
    consentStatus: consent.status === 'accepted' ? 'accepted' : 'withdrawn',
    consentRecordedAt: consent.recordedAt,
    consentVersion: consent.status === 'accepted' ? consent.privacyVersion : null,
  };
}

export function buildVaultConsentDisplay(input: VaultConsentDisplayInput): VaultConsentDisplay {
  if (input.tenantCode !== 'MK' || input.tenantCountryCode !== 'MK') {
    return { kind: 'hidden' };
  }
  if (input.claimCategory !== 'vehicle' && input.claimCategory !== 'property') {
    return { kind: 'hidden' };
  }
  if (input.piiStatus === 'erased_or_unavailable') {
    return { kind: 'subject_erased' };
  }
  return {
    kind: 'ready',
    items: input.documents
      .filter(document => document.category === 'evidence')
      .map(document => toDisplayItem(document, input.consents)),
  };
}
