'use client';

import { FileText, Image as ImageIcon, Music, UploadCloud } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { ScrollArea } from '@interdomestik/ui/components/scroll-area';

interface EvidenceDoc {
  id: string;
  url: string;
  name: string;
  fileType: string;
}

interface EvidencePanelProps {
  docs: EvidenceDoc[];
}

export function EvidencePanel({ docs }: EvidencePanelProps) {
  const t = useTranslations('admin.claims_page.evidence');

  const getIcon = (mime: string) => {
    if (mime.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-purple-500" />;
    if (mime.startsWith('audio/')) return <Music className="w-4 h-4 text-blue-500" />;
    return <FileText className="w-4 h-4 text-gray-500" />;
  };

  return (
    <Card className="h-full flex flex-col shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
            {t('title')}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6" title={t('upload_button')}>
            <UploadCloud className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 relative min-h-[120px]">
        {docs.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground italic p-4 text-center">
            {t('no_docs')}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col p-2 gap-1">
              {docs.map(doc => (
                <a
                  key={doc.id}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors group"
                >
                  <div className="flex-shrink-0">{getIcon(doc.fileType)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate text-foreground group-hover:text-primary transition-colors">
                      {doc.name}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
