'use client';

import { createClient } from '@interdomestik/database/client';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui';
import { Loader2, Upload } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  EVIDENCE_FILE_ACCEPT,
  resolveStorageUploadContentType,
  resolveUploadMimeType,
} from '@/features/admin/claims/components/ops/file-upload-meta';
import { AiExtractionConsentField } from './ai-extraction-consent-field';
import type {
  EvidenceCategory,
  SharedEvidenceUploadDialogProps,
} from './shared-evidence-upload-types';
import {
  type SignedStorageUploader,
  type SignedUploadDraft,
  useSignedUploadRetry,
  SignedUploadIdentityChangedError,
} from './use-signed-upload-retry';

export function SharedEvidenceUploadDialog({
  categoryFieldId,
  claimId,
  confirmUpload,
  fileFieldId,
  generateUploadUrl,
  informationRequestId,
  locale,
  messages,
  onUploadSuccess,
  trigger,
}: SharedEvidenceUploadDialogProps) {
  const tClaims = useTranslations('claims');
  const pathname = usePathname();
  const [lastFailure, setLastFailure] = useState(false);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<EvidenceCategory>('evidence');
  const [aiExtractionConsentGranted, setAiExtractionConsentGranted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch (error) {
      console.error('Failed to init Supabase client', error);
      return null;
    }
  }, []);

  const uploadToStorage: SignedStorageUploader = async (target, uploadFile, contentType) => {
    if (!supabase) {
      throw new Error(messages.storageUnavailable);
    }
    const { error: uploadError } = await supabase.storage
      .from(target.bucket)
      .uploadToSignedUrl(target.path, target.token, uploadFile, {
        contentType,
        upsert: true,
        cacheControl: '3600',
      });
    if (uploadError) {
      throw new Error(uploadError.message || messages.uploadFailed);
    }
  };

  const signedUpload = useSignedUploadRetry({
    claimId,
    confirmUpload,
    generateUploadUrl,
    informationRequestId,
    locale,
    recoveryHref: pathname,
    uploadToStorage,
  });
  const { pending, uploading } = signedUpload;
  // A pending signed upload pins its original file, category, and consent until it settles.
  const locked = uploading || pending !== null;
  const pendingFileId = `${fileFieldId}-pending-file`;

  useEffect(() => {
    // Only the unsubmitted draft resets on close; a pending signed upload keeps its identity.
    if (!open) {
      setFile(null);
      setAiExtractionConsentGranted(false);
    }
  }, [open]);

  const resetDialog = () => {
    setOpen(false);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setAiExtractionConsentGranted(false);
  };

  const usesDirectUpload = (selectedFile: File) =>
    !informationRequestId &&
    resolveUploadMimeType(selectedFile) !== resolveStorageUploadContentType(selectedFile);

  const handleDirectUpload = async (draft: SignedUploadDraft) => {
    const formData = new FormData();
    formData.append('claimId', claimId);
    formData.append('category', draft.category);
    formData.append('locale', locale);
    formData.append('file', draft.file);
    if (informationRequestId) {
      formData.append('informationRequestId', informationRequestId);
    }
    formData.append('aiExtractionConsentGranted', String(draft.consentGranted));

    const response = await fetch('/api/claims/evidence-upload', {
      method: 'POST',
      body: formData,
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      fileId?: string;
    } | null;

    if (!response.ok) {
      throw new Error(body?.error || messages.uploadFailed);
    }
    if (!body?.fileId) {
      throw new Error(messages.uploadFailed);
    }
    return body.fileId;
  };

  const handleUpload = async () => {
    const pendingUpload = signedUpload.getPending();
    const draft: SignedUploadDraft | null =
      pendingUpload ??
      (file ? { category, consentGranted: aiExtractionConsentGranted, file } : null);
    if (!draft) {
      fileInputRef.current?.click();
      return;
    }

    const attempt = signedUpload.acquire();
    if (!attempt) return;
    setLastFailure(false);
    try {
      const documentId =
        !pendingUpload && usesDirectUpload(draft.file)
          ? await handleDirectUpload(draft)
          : await signedUpload.uploadSigned(draft);
      onUploadSuccess?.({
        documentId,
        documentName: draft.file.name,
        submittedAt: new Date().toISOString(),
      });
      toast.success(messages.uploadSuccess);
      resetDialog();
      router.refresh();
    } catch (error) {
      setLastFailure(true);
      console.error('Upload flow error', error);
      toast.error(
        error instanceof SignedUploadIdentityChangedError
          ? tClaims('uploadRecovery.identityChanged')
          : error instanceof Error
            ? error.message
            : messages.uploadFailed
      );
    } finally {
      signedUpload.release(attempt);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{messages.dialogTitle}</DialogTitle>
          <DialogDescription>{messages.dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid w-full items-center gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor={categoryFieldId}>{messages.documentTypeLabel}</Label>
            <Select
              value={pending?.category ?? category}
              onValueChange={value => setCategory(value as EvidenceCategory)}
              disabled={locked}
            >
              <SelectTrigger id={categoryFieldId}>
                <SelectValue placeholder={messages.documentTypePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evidence">{messages.types.evidence}</SelectItem>
                <SelectItem value="legal">{messages.types.legal}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor={fileFieldId}>{messages.fileLabel}</Label>
            <Input
              ref={fileInputRef}
              id={fileFieldId}
              type="file"
              accept={EVIDENCE_FILE_ACCEPT}
              aria-describedby={pending ? pendingFileId : undefined}
              onChange={handleFileChange}
              disabled={locked}
            />
            {pending ? (
              <p id={pendingFileId} className="text-sm text-muted-foreground">
                {pending.file.name}
              </p>
            ) : null}
          </div>
          {messages.aiExtractionConsent ? (
            <AiExtractionConsentField
              id={`${fileFieldId}-ai-consent`}
              checked={pending?.consentGranted ?? aiExtractionConsentGranted}
              disabled={locked}
              label={messages.aiExtractionConsent}
              onCheckedChange={setAiExtractionConsentGranted}
            />
          ) : null}
        </div>
        {lastFailure || !signedUpload.identityMatches ? (
          <div role="status" data-testid="upload-recovery" className="space-y-2 text-sm">
            <p>{tClaims('uploadRecovery.description')}</p>
            <a className="underline underline-offset-4" href={pending?.recoveryHref ?? pathname}>
              {tClaims('uploadRecovery.action')}
            </a>
          </div>
        ) : null}
        <DialogFooter className="sm:justify-start">
          <Button
            type="button"
            variant="default"
            onClick={handleUpload}
            disabled={uploading || !signedUpload.identityMatches}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {messages.uploading}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> {messages.uploadButton}
              </>
            )}
          </Button>
          <Button type="button" variant="secondary" onClick={resetDialog} disabled={uploading}>
            {messages.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
