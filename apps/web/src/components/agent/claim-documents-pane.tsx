'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { format } from 'date-fns';
import { Download, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface ClaimDocumentsPaneProps {
  readonly documents: ReadonlyArray<{
    id: string;
    fileName: string | null;
    createdAt?: string | Date | null;
  }>;
}

export function ClaimDocumentsPane({ documents }: ClaimDocumentsPaneProps) {
  const t = useTranslations('agent-claims.claims');
  const tDocs = useTranslations('documents');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleDownload = async (docId: string, fileName: string | null) => {
    setLoadingId(docId);
    try {
      const fileRes = await fetch(`/api/documents/${docId}/download`);
      if (!fileRes.ok) throw new Error('Failed to download file');
      const blob = await fileRes.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error(tDocs('errors.download'));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t('details.documents')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('details.no_documents')}
            </p>
          ) : (
            documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.createdAt ? format(new Date(doc.createdAt), 'PPP') : 'Unknown date'}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDownload(doc.id, doc.fileName)}
                  disabled={loadingId === doc.id}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
