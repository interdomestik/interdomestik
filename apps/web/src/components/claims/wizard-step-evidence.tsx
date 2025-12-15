'use client';

import type { CreateClaimValues } from '@/lib/validators/claims';
import { Button } from '@interdomestik/ui/components/button';
import { Card } from '@interdomestik/ui/components/card';
import { FormField, FormItem, FormLabel, FormMessage } from '@interdomestik/ui/components/form';
import { FileText, Trash2, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@interdomestik/ui/components/tooltip';
import { useTranslations } from 'next-intl';

export function WizardStepEvidence() {
  const t = useTranslations('evidence');
  const form = useFormContext<CreateClaimValues>();
  const [mockFiles, setMockFiles] = useState<string[]>([]);

  const handleMockUpload = () => {
    setMockFiles([...mockFiles, `evidence_${mockFiles.length + 1}.pdf`]);
    // In a real app, we would handle the file upload here
    // For now, we update the form with a dummy array to pass validation if needed
    form.setValue('files', [...mockFiles, 'new_file']);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">Add Evidence</h2>
        <div className="flex items-center justify-center gap-2 mt-2">
          <p className="text-muted-foreground">Upload receipts, tickets, or photos.</p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <div className="rounded-full bg-slate-100 p-1 hover:bg-slate-200 cursor-help">
                  <span className="sr-only">Help</span>
                  <span className="text-xs font-bold text-slate-500">?</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{t('tooltip')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <Card
        className="border-dashed border-2 p-8 flex flex-col items-center justify-center gap-4 hover:bg-[hsl(var(--muted))]/50 transition-colors cursor-pointer"
        onClick={handleMockUpload}
      >
        <div className="p-4 bg-[hsl(var(--muted))] rounded-full">
          <UploadCloud className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
        </div>
        <div className="text-center">
          <p className="font-medium">Click to upload files</p>
          <p className="text-sm text-muted-foreground">PDF, JPG, or PNG up to 10MB</p>
        </div>
      </Card>

      {mockFiles.length > 0 && (
        <div className="space-y-2">
          <FormLabel>Attached Files</FormLabel>
          {mockFiles.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 border rounded-lg bg-card"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-[hsl(var(--primary))]" />
                <span className="text-sm font-medium">{file}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={e => {
                  e.stopPropagation();
                  setMockFiles(mockFiles.filter((_, i) => i !== idx));
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden field to register in form state */}
      <FormField
        control={form.control}
        name="files"
        render={() => (
          <FormItem>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
