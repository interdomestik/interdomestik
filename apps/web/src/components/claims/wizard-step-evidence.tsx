'use client';

import type { CreateClaimValues, EvidenceFile } from '@/lib/validators/claims';
import { createClient } from '@interdomestik/database/client';
import { Button } from '@interdomestik/ui/components/button';
import { Card } from '@interdomestik/ui/components/card';
import { FormField, FormItem, FormLabel, FormMessage } from '@interdomestik/ui/components/form';
import { Badge } from '@interdomestik/ui/components/badge';
import { AlertTriangle, FileText, Loader2, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@interdomestik/ui/components/tooltip';
import { useTranslations } from 'next-intl';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const CATEGORY_PROMPTS: Record<string, string[]> = {
  flight_delay: [
    'Boarding pass or ticket',
    'Airline delay/cancellation notice',
    'Receipts for meals/hotels/transport',
  ],
  damaged_goods: ['Photos of damage', 'Purchase receipt or invoice', 'Repair/assessment estimate'],
  service_issue: ['Contract/invoice', 'Chat/email screenshots', 'Bills or cancellation notice'],
  travel: ['Itinerary and tickets', 'Photos/videos of incident', 'Receipts for expenses'],
  default: ['Photos or screenshots', 'Receipts/invoices', 'Any official correspondence'],
};

function formatSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function WizardStepEvidence() {
  const t = useTranslations('evidence');
  const form = useFormContext<CreateClaimValues>();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = form.watch('files') ?? [];
  const category = form.watch('category') || 'default';
  const promptConfig = (t.raw('prompts') as Record<string, string[]>) || {};
  const promptList =
    promptConfig[category] || promptConfig.default || CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.default;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) return;

    setError(null);
    setIsUploading(true);

    for (const file of selectedFiles) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        setError(t('validation.mime'));
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(t('validation.size'));
        continue;
      }

      const response = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error || t('validation.prepare'));
        continue;
      }

      const payload = (await response.json()) as {
        upload: { path: string; token: string; bucket: string };
        classification?: string;
      };
      const upload = payload.upload;

      const { error: uploadError } = await supabase.storage
        .from(upload.bucket)
        .uploadToSignedUrl(upload.path, upload.token, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('Upload failed', uploadError);
        setError(t('validation.upload'));
        continue;
      }

      const evidenceFile: EvidenceFile = {
        id: upload.path,
        name: file.name,
        path: upload.path,
        type: file.type || 'application/octet-stream',
        size: file.size,
        bucket: upload.bucket,
        classification: payload.classification || 'pii',
      };

      const currentFiles = form.getValues('files') ?? [];
      form.setValue('files', [...currentFiles, evidenceFile], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    setIsUploading(false);
    event.target.value = '';
  };

  const removeFile = (id: string) => {
    const updatedFiles = files.filter(file => file.id !== id);
    form.setValue('files', updatedFiles, { shouldDirty: true, shouldValidate: true });
  };

  const handleMockUpload = () => {
    fileInputRef.current?.click();
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

      {promptList?.length ? (
        <Card className="border border-[hsl(var(--muted))] bg-[hsl(var(--muted))/20]">
          <div className="p-4 text-left space-y-2">
            <p className="text-sm font-semibold">{t('promptTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('promptDescription')}</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside grid grid-cols-1 sm:grid-cols-2 gap-y-1">
              {promptList.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-[hsl(var(--primary))]" />
          <span>Signed URL uploads · PII-tagged storage</span>
        </div>
        {isUploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Uploading securely…</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_MIME_TYPES.join(',')}
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </Card>

      {files.length === 0 && (
        <div className="rounded-lg border border-dashed border-[hsl(var(--warning-foreground))]/40 bg-[hsl(var(--warning))]/10 p-3 text-sm text-[hsl(var(--warning-foreground))] flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>
            <p className="font-medium">{t('emptyWarning.title')}</p>
            <p className="text-xs text-muted-foreground">{t('emptyWarning.body')}</p>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {files.length > 0 && (
        <div className="space-y-2">
          <FormLabel>Attached Files</FormLabel>
          {files.map(file => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 border rounded-lg bg-card gap-3"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-[hsl(var(--primary))]" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatSize(file.size)} · {file.type}
                  </span>
                  <Badge variant="secondary" className="w-fit mt-1 text-[10px]">
                    {file.classification?.toUpperCase() || 'PII'}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={e => {
                  e.stopPropagation();
                  removeFile(file.id);
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
