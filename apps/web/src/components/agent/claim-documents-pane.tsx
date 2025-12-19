'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { format } from 'date-fns';
import { Download, FileText } from 'lucide-react';

interface ClaimDocumentsPaneProps {
  documents: any[];
  t: any;
}

export function ClaimDocumentsPane({ documents, t }: ClaimDocumentsPaneProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t('documents', { defaultValue: 'Documents' })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded</p>
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
                <Button size="sm" variant="ghost">
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
