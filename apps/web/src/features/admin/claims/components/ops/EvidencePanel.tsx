'use client';

import { AdminClaimEvidenceUploadDialog } from '@/features/admin/claims/components/ops/AdminClaimEvidenceUploadDialog';
import { deniesClaimDocumentContent } from '@/app/api/documents/branch-manager-document-boundary';
import type { ClaimDocumentSummary } from '../../document-summary';
import { UploadCloud } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { OpsDocumentsPanel } from '@/components/ops';
import { Button } from '@interdomestik/ui/components/button';

interface EvidenceDoc {
  id: string;
  url: string;
  name: string;
}

interface EvidencePanelProps {
  readonly claimId: string;
  readonly docs: EvidenceDoc[];
  readonly readOnly?: boolean;
  readonly viewerRole?: string | null;
  readonly documentSummary?: ClaimDocumentSummary;
}

export function EvidencePanel({
  claimId,
  docs,
  readOnly = false,
  viewerRole,
  documentSummary,
}: EvidencePanelProps) {
  const t = useTranslations('admin.claims_page.evidence');
  const tCommon = useTranslations('common');
  if (deniesClaimDocumentContent(viewerRole)) {
    return (
      <OpsDocumentsPanel
        title={t('title')}
        documents={[]}
        emptyLabel={t('allocation_summary', { count: documentSummary?.count ?? 0 })}
        viewLabel={tCommon('view')}
      />
    );
  }
  const mappedDocs = docs.map(doc => ({
    id: doc.id,
    name: doc.name,
    url: doc.url,
  }));

  return (
    <OpsDocumentsPanel
      title={t('title')}
      documents={mappedDocs}
      unavailableLabel={t('file_unavailable')}
      emptyLabel={t('no_docs')}
      viewLabel={tCommon('view')}
      headerActions={
        readOnly ? null : (
          <AdminClaimEvidenceUploadDialog
            claimId={claimId}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title={t('upload_button')}
                aria-label={t('upload_button')}
              >
                <UploadCloud className="w-4 h-4" />
              </Button>
            }
          />
        )
      }
    />
  );
}
