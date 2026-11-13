'use client';

import { Button } from '@interdomestik/ui/components/button';
import { Download, Eye, FileText, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { documentFileKind } from './document-file-type';

type Document = {
  id: string;
  name: string;
  fileSize: number;
  fileType: string;
};

// Icon-only on phones, so each action keeps a localized name and a 44px target below `sm`.
const DOCUMENT_ACTION_CLASS =
  'h-auto min-h-11 min-w-11 max-w-full whitespace-normal [overflow-wrap:anywhere] sm:min-h-9 sm:min-w-0';

type Props = {
  documents: Document[];
};

export function DocumentList({ documents }: Readonly<Props>) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const t = useTranslations('documents');
  const tFileTypes = useTranslations('common.fileTypes');

  const handleView = async (docId: string) => {
    setLoadingId(docId);
    try {
      // Open proxy stream in new tab so RBAC + access logs remain server-side.
      window.open(`/api/documents/${docId}/download?disposition=inline`, '_blank');
    } catch (error) {
      console.error('Error fetching document:', error);
      alert(t('errors.view'));
    } finally {
      setLoadingId(null);
    }
  };

  const handleDownload = async (docId: string, fileName: string) => {
    setLoadingId(docId);
    try {
      // Fetch via proxy so RBAC + access logs remain server-side.
      const fileRes = await fetch(`/api/documents/${docId}/download`);
      if (!fileRes.ok) throw new Error('Failed to download file');
      const blob = await fileRes.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      alert(t('errors.download'));
    } finally {
      setLoadingId(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('emptyList')}</p>;
  }

  return (
    <div className="space-y-2">
      {documents.map(doc => (
        <div
          key={doc.id}
          className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-3 border rounded-lg bg-card"
        >
          <div className="flex min-w-0 max-w-full items-center gap-3">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p id={`document-name-${doc.id}`} className="text-sm font-medium">
                {doc.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSize(doc.fileSize)} · {tFileTypes(documentFileKind(doc.fileType))}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className={DOCUMENT_ACTION_CLASS}
              aria-describedby={`document-name-${doc.id}`}
              aria-label={t('actions.view')}
              onClick={() => handleView(doc.id)}
              disabled={loadingId === doc.id}
            >
              {loadingId === doc.id ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className="ml-1 hidden sm:inline">{t('actions.view')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={DOCUMENT_ACTION_CLASS}
              aria-describedby={`document-name-${doc.id}`}
              aria-label={t('actions.download')}
              onClick={() => handleDownload(doc.id, doc.name)}
              disabled={loadingId === doc.id}
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="ml-1 hidden sm:inline">{t('actions.download')}</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
