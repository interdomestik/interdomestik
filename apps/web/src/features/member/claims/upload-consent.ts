export const AI_DOCUMENT_EXTRACTION_PRIVACY_VERSION = 'privacy-2026-05';

export type ConfirmUploadParams = {
  aiExtractionConsentGranted?: boolean;
  aiExtractionConsentLocale?: string;
  claimId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileId: string;
  uploadIntentToken: string;
  storageContentType?: string;
  uploadedBucket?: string;
  category?: 'evidence' | 'legal';
};

export function buildMemberAiExtractionConsent(params: ConfirmUploadParams) {
  return {
    granted: params.aiExtractionConsentGranted === true,
    locale: params.aiExtractionConsentLocale ?? 'en',
    privacyVersion: AI_DOCUMENT_EXTRACTION_PRIVACY_VERSION,
    sourceSurface: 'member_claim_evidence_upload',
  };
}
