'use client';

import {
  confirmAdminUpload,
  generateAdminUploadUrl,
} from '@/features/admin/claims/actions/evidence-upload';
import { SharedEvidenceUploadDialog } from '@/features/claims/components/SharedEvidenceUploadDialog';
import { Button } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';

export function ClaimRegisterDocumentUpload({ claimId }: { claimId: string }) {
  const t = useTranslations('staff-correspondence.documents');
  const common = useTranslations('common');
  const locale = useLocale();

  return (
    <SharedEvidenceUploadDialog
      categoryFieldId="case-register-upload-category"
      claimId={claimId}
      confirmUpload={confirmAdminUpload}
      fileFieldId="case-register-upload-file"
      generateUploadUrl={generateAdminUploadUrl}
      locale={locale}
      messages={{
        dialogTitle: t('upload'),
        dialogDescription: t('description'),
        documentTypeLabel: t('type'),
        documentTypePlaceholder: t('chooseType'),
        fileLabel: t('file'),
        uploadButton: t('upload'),
        uploading: t('uploading'),
        cancel: common('cancel'),
        uploadSuccess: t('uploaded'),
        uploadFailed: t('failed'),
        storageUnavailable: t('failed'),
        types: { evidence: t('evidence'), legal: t('legal') },
      }}
      trigger={
        <Button type="button" variant="outline">
          {t('upload')}
        </Button>
      }
    />
  );
}
