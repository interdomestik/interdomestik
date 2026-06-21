import { confirmAdminUpload } from '@/features/admin/claims/actions';
import { confirmUpload } from '@/features/member/claims/actions';

type UploadCategory = 'evidence' | 'legal';

export type EvidenceUploadConfirmationInput = {
  aiExtractionConsentGranted: boolean;
  bucket: string;
  category: UploadCategory;
  claimId: string;
  file: File;
  fileId: string;
  isAdminSurface: boolean;
  locale: string;
  resolvedMimeType: string;
  storageContentType: string;
  storagePath: string;
  uploadIntentToken: string;
};

export function confirmEvidenceUpload(params: EvidenceUploadConfirmationInput) {
  const confirmation = {
    aiExtractionConsentGranted: params.isAdminSurface ? false : params.aiExtractionConsentGranted,
    aiExtractionConsentLocale: params.locale,
    claimId: params.claimId,
    storagePath: params.storagePath,
    originalName: params.file.name,
    mimeType: params.resolvedMimeType,
    fileSize: params.file.size,
    fileId: params.fileId,
    uploadIntentToken: params.uploadIntentToken,
    storageContentType: params.storageContentType,
    uploadedBucket: params.bucket,
    category: params.category,
  };

  return params.isAdminSurface ? confirmAdminUpload(confirmation) : confirmUpload(confirmation);
}
