'use client';

import { Button, Separator } from '@interdomestik/ui';
import { FileText } from 'lucide-react';
import type { OpsDocument } from './types';

interface OpsDocumentsPanelProps {
  title: string;
  documents: OpsDocument[];
  emptyLabel: string;
  viewLabel: string;
}

export function OpsDocumentsPanel({
  title,
  documents,
  emptyLabel,
  viewLabel,
}: OpsDocumentsPanelProps) {
  return (
    <div className="space-y-3" data-testid="ops-documents-panel">
      <h4 className="font-medium flex items-center gap-2">
        <FileText className="w-4 h-4" /> {title}
      </h4>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground italic" data-testid="ops-documents-empty">
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-2 border rounded-md text-sm"
              data-testid="ops-document-row"
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
