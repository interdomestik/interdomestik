import { OpsDocumentsPanel } from '@/components/ops';
import { toOpsDocuments } from '@/components/ops/adapters/verification';
import { useTranslations } from 'next-intl';
import { deniesClaimDocumentContent } from '@/app/api/documents/branch-manager-document-boundary';

interface VerificationDocumentsProps {
  viewerRole?: string | null;
  documents: {
    id: string;
    name: string;
    url: string;
    uploadedAt: Date;
  }[];
}

export function VerificationDocuments({
  documents,
  viewerRole,
}: Readonly<VerificationDocumentsProps>) {
  const t = useTranslations('admin.leads');
  if (deniesClaimDocumentContent(viewerRole)) return null;
  const opsDocs = toOpsDocuments(documents);

  return (
    <OpsDocumentsPanel
      title={t('drawer.documents')}
      documents={opsDocs}
      emptyLabel={t('labels.missing_proof')}
      viewLabel={t('actions.view_proof')}
    />
  );
}
