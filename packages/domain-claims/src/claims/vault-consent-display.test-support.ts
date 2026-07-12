import type {
  VaultConsentDisplayInput,
  VaultConsentDocumentSource,
  VaultConsentSource,
} from './vault-consent-display';

export function input(overrides: Partial<VaultConsentDisplayInput> = {}): VaultConsentDisplayInput {
  return {
    tenantCode: 'MK',
    tenantCountryCode: 'MK',
    claimCategory: 'vehicle',
    piiStatus: 'available',
    documents: [],
    consents: [],
    ...overrides,
  };
}

export function evidenceDocument(
  overrides: Partial<VaultConsentDocumentSource> = {}
): VaultConsentDocumentSource {
  return { id: 'evidence-1', category: 'evidence', createdAt: null, ...overrides };
}

export function consent(overrides: Partial<VaultConsentSource> = {}): VaultConsentSource {
  return {
    id: 'consent-1',
    documentId: 'evidence-1',
    consentType: 'ai_document_extraction',
    processingPurpose: 'ai_document_extraction',
    status: 'accepted',
    recordedAt: new Date('2026-07-05T10:00:00Z'),
    privacyVersion: 'privacy-2026-07',
    ...overrides,
  };
}
