'use client';

import { confirmAdminUpload, generateAdminUploadUrl } from '@/features/admin/claims/actions';
import { SharedEvidenceUploadDialog } from '@/features/claims/components/SharedEvidenceUploadDialog';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

interface AdminClaimEvidenceUploadDialogProps {
  claimId: string;
  trigger: React.ReactNode;
}

export function AdminClaimEvidenceUploadDialog({
  claimId,
  trigger,
}: AdminClaimEvidenceUploadDialogProps) {
  const t = useTranslations('admin.claims_page.evidence');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';

  return (
    <SharedEvidenceUploadDialog
      categoryFieldId="admin-document-category"
      claimId={claimId}
      confirmUpload={confirmAdminUpload}
      fileFieldId="admin-evidence-file"
      generateUploadUrl={generateAdminUploadUrl}
      locale={locale}
      messages={{
        dialogTitle: t('dialog_title'),
        dialogDescription: t('dialog_description'),
        documentTypeLabel: t('document_type_label'),
        documentTypePlaceholder: t('document_type_placeholder'),
        fileLabel: t('file_label'),
        uploadButton: t('upload_button'),
        uploading: t('uploading'),
        cancel: tCommon('cancel'),
        uploadSuccess: t('upload_success'),
        uploadFailed: t('upload_failed'),
        storageUnavailable: t('upload_failed'),
        types: {
          evidence: t('types.evidence'),
          legal: t('types.legal'),
        },
      }}
      trigger={trigger}
    />
  );
}
