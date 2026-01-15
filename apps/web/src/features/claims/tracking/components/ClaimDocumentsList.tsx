'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { format } from 'date-fns';
import { FileIcon } from 'lucide-react'; // Direct lucide usage for now or check local icons
import { useTranslations } from 'next-intl';
import type { ClaimTrackingDocument } from '../types';

interface ClaimDocumentsListProps {
  documents: ClaimTrackingDocument[];
  className?: string;
}

export function ClaimDocumentsList({ documents, className }: ClaimDocumentsListProps) {
  const t = useTranslations('claims-tracking.tracking.documents');

  if (!documents.length) {
    return (
      <Card className={className} data-testid="claim-documents-empty">
        <CardHeader>
          <CardTitle className="text-lg">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className} data-testid="claim-documents">
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {documents.map(doc => (
          <div
            key={doc.id}
            className="flex items-start space-x-3 p-3 border rounded-lg bg-muted/20"
          >
            <div className="bg-background p-2 rounded border">
              {/* Fallback icon if specific file type icons aren't available */}
              <FileIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1 overflow-hidden">
              <p className="text-sm font-medium truncate" title={doc.name}>
                {doc.name}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span>{format(new Date(doc.createdAt), 'PP')}</span>
                <span>•</span>
                <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
