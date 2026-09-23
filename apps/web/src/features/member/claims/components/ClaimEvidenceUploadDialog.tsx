'use client';

import { SharedEvidenceUploadDialog } from '@/features/claims/components/SharedEvidenceUploadDialog';
import { confirmUpload, generateUploadUrl } from '@/features/member/claims/actions';
import { useLocale, useTranslations } from 'next-intl';

interface ClaimEvidenceUploadDialogProps {
  readonly claimId: string;
  readonly informationRequestId?: string;
  readonly onUploadSuccess?: (evidence: {
    documentId: string;
    documentName: string;
    submittedAt: string;
  }) => void;
  readonly trigger: React.ReactNode;
}

export function ClaimEvidenceUploadDialog({
  claimId,
  informationRequestId,
  onUploadSuccess,
  trigger,
}: ClaimEvidenceUploadDialogProps) {
  const locale = useLocale();
  const t = useTranslations('claims.detail.evidenceUpload');
  const tClaims = useTranslations('claims');
  const tCommon = useTranslations('common');

  return (
    <SharedEvidenceUploadDialog
      categoryFieldId={`document-category-${informationRequestId ?? claimId}`}
      claimId={claimId}
      confirmUpload={confirmUpload}
      fileFieldId={`file-${informationRequestId ?? claimId}`}
      generateUploadUrl={generateUploadUrl}
      informationRequestId={informationRequestId}
      locale={locale}
      messages={{
        dialogTitle: tClaims('claimsPro.actions.uploadEvidence'),
        dialogDescription: t('description'),
        documentTypeLabel: t('typeLabel'),
        documentTypePlaceholder: t('typeLabel'),
        fileLabel: t('file'),
        uploadButton: tClaims('claimsPro.actions.uploadEvidence'),
        uploading: t('pending'),
        cancel: tCommon('cancel'),
        uploadSuccess: t('success'),
        uploadFailed: t('failed'),
        storageUnavailable: t('storage'),
        aiExtractionConsent: t('aiConsent'),
        types: {
          evidence: t('types.evidence'),
          legal: t('types.legal'),
        },
      }}
      onUploadSuccess={onUploadSuccess}
      trigger={trigger}
    />
  );
}
