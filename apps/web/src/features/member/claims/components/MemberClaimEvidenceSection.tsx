'use client';

import { OpsDocumentsPanel } from '@/components/ops';
import { toOpsDocuments } from '@/components/ops/adapters/claims';
import { Button } from '@interdomestik/ui';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MemberClaimDetailOpsClaim } from './member-claim-detail-types';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';
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
}: MemberClaimEvidenceSectionProps) {
  const t = useTranslations('claims');
  return (
    <div className="min-w-0 space-y-4">
      <MemberVaultConsentCard display={vaultConsentDisplay} />
      <OpsDocumentsPanel
        title={t('detail.evidence')}
        documents={toOpsDocuments(documents)}
        emptyLabel={t('detail.documentsEmpty')}
        viewLabel={t('detail.viewDocument')}
        headerActions={
          <ClaimEvidenceUploadDialog
            claimId={claimId}
            trigger={
              <Button size="sm" variant="outline">
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('claimsPro.actions.uploadEvidence')}
              </Button>
            }
          />
        }
      />
    </div>
  );
}
