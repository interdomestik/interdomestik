'use client';

import { SharedEvidenceUploadDialog } from '@/features/claims/components/SharedEvidenceUploadDialog';
import { confirmUpload, generateUploadUrl } from '@/features/member/claims/actions';
import { usePathname } from 'next/navigation';

interface ClaimEvidenceUploadDialogProps {
  claimId: string;
  trigger: React.ReactNode;
}

export function ClaimEvidenceUploadDialog({ claimId, trigger }: ClaimEvidenceUploadDialogProps) {
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';

  return (
    <SharedEvidenceUploadDialog
      categoryFieldId="document-category"
      claimId={claimId}
      confirmUpload={confirmUpload}
      fileFieldId="file"
      generateUploadUrl={generateUploadUrl}
      locale={locale}
      messages={{
        dialogTitle: 'Upload Evidence',
        dialogDescription: 'Attach photos or documents relevant to this claim.',
        documentTypeLabel: 'Document Type',
        documentTypePlaceholder: 'Select document type',
        fileLabel: 'File',
        uploadButton: 'Upload',
        uploading: 'Uploading...',
        cancel: 'Cancel',
        uploadSuccess: 'Evidence uploaded successfully',
        uploadFailed: 'Failed to upload evidence',
        storageUnavailable: 'Storage client unavailable',
        types: {
          evidence: 'Evidence',
          legal: 'Legal document',
        },
      }}
      trigger={trigger}
    />
  );
}
