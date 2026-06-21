import type React from 'react';

type EvidenceCategory = 'evidence' | 'legal';

type UploadUrlSuccess = {
  success: true;
  bucket: string;
  path: string;
  token: string;
  intentToken: string;
  id: string;
};

type UploadUrlFailure = { success: false; error: string };
type ConfirmUploadSuccess = { success: true };
type ConfirmUploadFailure = { success: false; error: string };

export type GenerateUploadUrlFn = (
  claimId: string,
  fileName: string,
  contentType: string,
  fileSize: number
) => Promise<UploadUrlSuccess | UploadUrlFailure>;

export type ConfirmUploadFn = (params: {
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
  uploadedBucket: string;
  category: EvidenceCategory;
}) => Promise<ConfirmUploadSuccess | ConfirmUploadFailure>;

export interface SharedEvidenceUploadDialogMessages {
  dialogTitle: string;
  dialogDescription: string;
  documentTypeLabel: string;
  documentTypePlaceholder: string;
  fileLabel: string;
  uploadButton: string;
  uploading: string;
  cancel: string;
  uploadSuccess: string;
  uploadFailed: string;
  storageUnavailable: string;
  aiExtractionConsent?: string;
  types: {
    evidence: string;
    legal: string;
  };
}

export interface SharedEvidenceUploadDialogProps {
  categoryFieldId: string;
  claimId: string;
  confirmUpload: ConfirmUploadFn;
  fileFieldId: string;
  generateUploadUrl: GenerateUploadUrlFn;
  locale: string;
  messages: SharedEvidenceUploadDialogMessages;
  trigger: React.ReactNode;
}

export type { EvidenceCategory };
