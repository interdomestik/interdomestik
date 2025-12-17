'use client';

import { Button } from '@interdomestik/ui/components/button';
import { Download, Eye, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';

type Document = {
  id: string;
  name: string;
  fileSize: number;
  fileType: string;
};

type Props = {
  documents: Document[];
};

export function DocumentList({ documents }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleView = async (docId: string) => {
    setLoadingId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (!res.ok) {
        throw new Error('Failed to get document URL');
      }
      const data = await res.json();
      // Open in new tab
      window.open(data.url, '_blank');
    } catch (error) {
      console.error('Error fetching document:', error);
      alert('Failed to load document. Please try again.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDownload = async (docId: string, fileName: string) => {
    setLoadingId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (!res.ok) {
        throw new Error('Failed to get document URL');
      }
      const data = await res.json();

      // Fetch the file and trigger download
      const fileRes = await fetch(data.url);
      const blob = await fileRes.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      alert('Failed to download document. Please try again.');
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
    return <p className="text-sm text-muted-foreground">No documents attached.</p>;
  }

  return (
    <div className="space-y-2">
      {documents.map(doc => (
        <div
          key={doc.id}
          className="flex items-center justify-between p-3 border rounded-lg bg-card"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium">{doc.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(doc.fileSize)} · {doc.fileType}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleView(doc.id)}
              disabled={loadingId === doc.id}
            >
              {loadingId === doc.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              <span className="ml-1 hidden sm:inline">View</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload(doc.id, doc.name)}
              disabled={loadingId === doc.id}
            >
              <Download className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Download</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
