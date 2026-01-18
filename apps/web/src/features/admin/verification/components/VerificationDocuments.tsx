import { OpsDocumentsPanel } from '@/components/ops';
import { toOpsDocuments } from '@/components/ops/adapters/verification';
import { useTranslations } from 'next-intl';

interface VerificationDocumentsProps {
  documents: {
    id: string;
    name: string;
    url: string;
    uploadedAt: Date;
  }[];
}

export function VerificationDocuments({ documents }: VerificationDocumentsProps) {
  const t = useTranslations('admin.leads');
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
