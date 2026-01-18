'use client';

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
  docs: EvidenceDoc[];
}

export function EvidencePanel({ docs }: EvidencePanelProps) {
  const t = useTranslations('admin.claims_page.evidence');
  const tCommon = useTranslations('common');
  const mappedDocs = docs.map(doc => ({
    id: doc.id,
    name: doc.name,
    url: doc.url,
  }));

  return (
    <OpsDocumentsPanel
      title={t('title')}
      documents={mappedDocs}
      emptyLabel={t('no_docs')}
      viewLabel={tCommon('view')}
      headerActions={
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
  );
}
