import { useTranslations } from 'next-intl';
import { OpsDocumentsPanel } from '@/components/ops';

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
  const opsDocs = documents.map(doc => ({
    id: doc.id,
    name: doc.name,
    url: doc.url,
    uploadedAt: doc.uploadedAt,
  }));

  return (
    <OpsDocumentsPanel
      title={t('drawer.documents')}
      documents={opsDocs}
      emptyLabel={t('labels.missing_proof')}
      viewLabel={t('actions.view_proof')}
    />
  );
}
