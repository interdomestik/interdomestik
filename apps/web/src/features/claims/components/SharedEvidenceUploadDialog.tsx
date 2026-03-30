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
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  EVIDENCE_FILE_ACCEPT,
  resolveStorageUploadContentType,
  resolveUploadMimeType,
} from '@/features/admin/claims/components/ops/file-upload-meta';

type EvidenceCategory = 'evidence' | 'legal';

type UploadUrlSuccess = {
  success: true;
  bucket: string;
  path: string;
  token: string;
  id: string;
};

type UploadUrlFailure = {
  success: false;
  error: string;
};

type ConfirmUploadSuccess = {
  success: true;
};

type ConfirmUploadFailure = {
  success: false;
  error: string;
};

type GenerateUploadUrlFn = (
  claimId: string,
  fileName: string,
  contentType: string,
  fileSize: number
) => Promise<UploadUrlSuccess | UploadUrlFailure>;

type ConfirmUploadFn = (params: {
  claimId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileId: string;
  uploadedBucket: string;
  category: EvidenceCategory;
}) => Promise<ConfirmUploadSuccess | ConfirmUploadFailure>;

interface SharedEvidenceUploadDialogMessages {
  dialogTitle: string;
  dialogDescription: string;
  documentTypeLabel: string;
  documentTypePlaceholder: string;
  fileLabel: string;
  uploadButton: string;
  uploading: string;
  cancel: string;
  uploadSuccess: string;
  uploadFailed: string;
  storageUnavailable: string;
  types: {
    evidence: string;
    legal: string;
  };
}

interface SharedEvidenceUploadDialogProps {
  categoryFieldId: string;
  claimId: string;
  confirmUpload: ConfirmUploadFn;
  fileFieldId: string;
  generateUploadUrl: GenerateUploadUrlFn;
  locale: string;
  messages: SharedEvidenceUploadDialogMessages;
  trigger: React.ReactNode;
}

export function SharedEvidenceUploadDialog({
  categoryFieldId,
  claimId,
  confirmUpload,
  fileFieldId,
  generateUploadUrl,
  locale,
  messages,
  trigger,
}: SharedEvidenceUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<EvidenceCategory>('evidence');
  const [uploading, setUploading] = useState(false);
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

  const resetDialog = () => {
    setOpen(false);
    setFile(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
  };

  const handleDirectUpload = async (selectedFile: File, selectedCategory: EvidenceCategory) => {
    const formData = new FormData();
    formData.append('claimId', claimId);
    formData.append('category', selectedCategory);
    formData.append('locale', locale);
    formData.append('file', selectedFile);

    const response = await fetch('/api/claims/evidence-upload', {
      method: 'POST',
      body: formData,
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      throw new Error(body?.error || messages.uploadFailed);
    }
  };

  const handleSignedUpload = async (selectedFile: File, selectedCategory: EvidenceCategory) => {
    const resolvedMimeType = resolveUploadMimeType(selectedFile);
    const storageContentType = resolveStorageUploadContentType(selectedFile);
    const uploadFile =
      storageContentType === resolvedMimeType
        ? selectedFile
        : new File([selectedFile], selectedFile.name, {
            type: storageContentType,
            lastModified: selectedFile.lastModified,
          });

    if (resolvedMimeType !== storageContentType) {
      await handleDirectUpload(selectedFile, selectedCategory);
      return;
    }

    const uploadUrlResult = await generateUploadUrl(
      claimId,
      selectedFile.name,
      resolvedMimeType,
      selectedFile.size
    );

    if (!uploadUrlResult.success) {
      throw new Error(uploadUrlResult.error);
    }

    if (!supabase) {
      throw new Error(messages.storageUnavailable);
    }

    const { error: uploadError } = await supabase.storage
      .from(uploadUrlResult.bucket)
      .uploadToSignedUrl(uploadUrlResult.path, uploadUrlResult.token, uploadFile, {
        contentType: storageContentType,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      throw new Error(uploadError.message || messages.uploadFailed);
    }

    const confirmResult = await confirmUpload({
      claimId,
      storagePath: uploadUrlResult.path,
      originalName: selectedFile.name,
      mimeType: resolvedMimeType,
      fileSize: selectedFile.size,
      fileId: uploadUrlResult.id,
      uploadedBucket: uploadUrlResult.bucket,
      category: selectedCategory,
    });

    if (!confirmResult.success) {
      throw new Error(confirmResult.error);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      fileInputRef.current?.click();
      return;
    }

    setUploading(true);
    try {
      await handleSignedUpload(file, category);
      toast.success(messages.uploadSuccess);
      resetDialog();
      router.refresh();
    } catch (error) {
      console.error('Upload flow error', error);
      toast.error(error instanceof Error ? error.message : messages.uploadFailed);
    } finally {
      setUploading(false);
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
              value={category}
              onValueChange={value => setCategory(value as EvidenceCategory)}
              disabled={uploading}
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
              onChange={handleFileChange}
              disabled={uploading}
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button type="button" variant="default" onClick={handleUpload} disabled={uploading}>
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
