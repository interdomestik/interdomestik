'use client';

import { Button, Separator } from '@interdomestik/ui';
import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { OPS_TEST_IDS } from './testids';
import type { OpsDocument } from './types';

interface OpsDocumentsPanelProps {
  title: string;
  documents: OpsDocument[];
  emptyLabel: string;
  viewLabel: string;
  headerActions?: ReactNode;
  className?: string;
}

export function OpsDocumentsPanel({
  title,
  documents,
  emptyLabel,
  viewLabel,
  headerActions,
  className,
}: OpsDocumentsPanelProps) {
  const containerClassName = ['space-y-3', className].filter(Boolean).join(' ');

  return (
    <div className={containerClassName} data-testid={OPS_TEST_IDS.DOCUMENTS.PANEL}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-medium flex items-center gap-2">
          <FileText className="w-4 h-4" /> {title}
        </h4>
        {headerActions}
      </div>
      {documents.length === 0 ? (
        <p
          className="text-sm text-muted-foreground italic"
          data-testid={OPS_TEST_IDS.DOCUMENTS.EMPTY}
        >
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-2 border rounded-md text-sm"
              data-testid={OPS_TEST_IDS.DOCUMENTS.ROW}
            >
              <span className="truncate max-w-[200px]" title={doc.name}>
                {doc.name}
              </span>
              {doc.url && (
                <Button variant="ghost" size="sm" asChild className="h-7">
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    {viewLabel}
                  </a>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <Separator />
    </div>
  );
}

export function toOpsDocuments(docs: any[]): OpsDocument[] {
  if (!Array.isArray(docs)) return [];
  return docs.map(d => ({
    id: d.id,
    name: d.name || d.fileName || 'Document',
    url: d.url || d.path,
    uploadedAt: d.createdAt || d.uploadedAt,
  }));
}
