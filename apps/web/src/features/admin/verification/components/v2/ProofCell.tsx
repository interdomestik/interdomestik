'use client';

import { Button } from '@interdomestik/ui';
import { FileText, HelpCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CashVerificationRequestDTO } from '../../server/types';

interface ProofCellProps {
  request: CashVerificationRequestDTO;
}

export function ProofCell({ request }: ProofCellProps) {
  const t = useTranslations('admin.leads');

  if (request.documentPath) {
    return (
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="h-8 group-hover:bg-blue-50/50 group-hover:text-blue-600 transition-colors"
      >
        <a
          href={`/api/documents/${request.documentId}/download`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          <span className="text-xs underline-offset-4 group-hover:underline">
            {t('actions.view_proof')}
          </span>
        </a>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-yellow-600/80 text-xs px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20 w-fit">
      <HelpCircle className="w-3 h-3" />
      <span>{t('labels.missing_proof')}</span>
    </div>
  );
}
