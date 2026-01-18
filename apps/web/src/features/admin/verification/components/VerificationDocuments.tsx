import { Button, Separator } from '@interdomestik/ui';
import { FileText } from 'lucide-react';
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

  return (
    <div className="space-y-3">
      <h4 className="font-medium flex items-center gap-2">
        <FileText className="w-4 h-4" /> {t('drawer.documents')}
      </h4>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{t('labels.missing_proof')}</p>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-2 border rounded-md text-sm"
            >
              <span className="truncate max-w-[200px]" title={doc.name}>
                {doc.name}
              </span>
              <Button variant="ghost" size="sm" asChild className="h-7">
                <a href={doc.url} target="_blank" rel="noopener noreferrer">
                  {t('actions.view_proof')}
                </a>
              </Button>
            </div>
          ))}
        </div>
      )}
      <Separator />
    </div>
  );
}
