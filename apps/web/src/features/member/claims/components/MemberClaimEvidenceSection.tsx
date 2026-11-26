'use client';

import { toOpsDocuments } from '@/components/ops/adapters/claims';
import { Button } from '@interdomestik/ui';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MemberClaimDetailOpsClaim } from './member-claim-detail-types';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';
import { MemberClaimDocumentsList } from './member-claim-documents-list';
import { DETAIL_OUTLINE_BUTTON } from './member-claim-detail-styles';
import { MemberVaultConsentCard } from './MemberVaultConsentCard';

interface MemberClaimEvidenceSectionProps {
  claimId: string;
  documents: MemberClaimDetailOpsClaim['documents'];
  vaultConsentDisplay: MemberClaimDetailOpsClaim['vaultConsentDisplay'];
}

export function MemberClaimEvidenceSection({
  claimId,
  documents,
  vaultConsentDisplay,
}: Readonly<MemberClaimEvidenceSectionProps>) {
  const t = useTranslations('claims');
  return (
    <div className="min-w-0 space-y-4">
      <MemberVaultConsentCard display={vaultConsentDisplay} />
      <MemberClaimDocumentsList
        documents={toOpsDocuments(documents)}
        uploadAction={
          <ClaimEvidenceUploadDialog
            claimId={claimId}
            trigger={
              <Button className={DETAIL_OUTLINE_BUTTON} variant="outline">
                <Upload aria-hidden="true" className="size-4 shrink-0" />
                {t('claimsPro.actions.uploadEvidence')}
              </Button>
            }
          />
        }
      />
    </div>
  );
}
