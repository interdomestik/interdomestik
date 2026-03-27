'use client';

import { confirmUpload, generateUploadUrl } from '@/features/member/claims/actions';
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
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  EVIDENCE_FILE_ACCEPT,
  resolveStorageUploadContentType,
  resolveUploadMimeType,
} from '@/features/admin/claims/components/ops/file-upload-meta';

interface ClaimEvidenceUploadDialogProps {
  claimId: string;
  trigger: React.ReactNode;
}

export function ClaimEvidenceUploadDialog({ claimId, trigger }: ClaimEvidenceUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<'evidence' | 'legal'>('evidence');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch (error) {
      console.error('Failed to init Supabase client', error);
      return null;
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      fileInputRef.current?.click();
      return;
    }

    const resolvedMimeType = resolveUploadMimeType(file);
    const storageContentType = resolveStorageUploadContentType(file);
    const uploadFile =
      storageContentType === resolvedMimeType
        ? file
        : new File([file], file.name, {
            type: storageContentType,
            lastModified: file.lastModified,
          });

    setUploading(true);
    try {
      if (resolvedMimeType !== storageContentType) {
        const formData = new FormData();
        formData.append('claimId', claimId);
        formData.append('category', category);
        formData.append('locale', locale);
        formData.append('file', file);

        const response = await fetch('/api/claims/evidence-upload', {
          method: 'POST',
          body: formData,
        });
        const body = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          throw new Error(body?.error || 'Failed to upload evidence');
        }

        toast.success('Evidence uploaded successfully');
        setOpen(false);
        setFile(null);
        router.refresh();
        return;
      }

      // 1. Get Presigned URL
      const genResult = await generateUploadUrl(claimId, file.name, resolvedMimeType, file.size);

      if (!genResult.success) {
        throw new Error(genResult.error);
      }

      if (!supabase) {
        throw new Error('Storage client unavailable');
      }

      // 2. Upload to Storage using the same signed-upload flow as the claim wizard.
      const { error: uploadError } = await supabase.storage
        .from(genResult.bucket)
        .uploadToSignedUrl(genResult.path, genResult.token, uploadFile, {
          contentType: storageContentType,
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('Storage upload failed', uploadError);
        throw new Error(uploadError.message || 'Storage upload failed');
      }

      // 3. Confirm in DB
      const confirmRes = await confirmUpload({
        claimId,
        storagePath: genResult.path,
        originalName: file.name,
        mimeType: resolvedMimeType,
        fileSize: file.size,
        fileId: genResult.id,
        uploadedBucket: genResult.bucket,
        category,
      });

      if (!confirmRes.success) {
        throw new Error(confirmRes.error);
      }

      toast.success('Evidence uploaded successfully');
      setOpen(false);
      setFile(null);
      router.refresh();
    } catch (err: unknown) {
      console.error('Upload flow error:', err);
      const message = err instanceof Error ? err.message : 'Failed to upload evidence';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Evidence</DialogTitle>
          <DialogDescription>Attach photos or documents relevant to this claim.</DialogDescription>
        </DialogHeader>
        <div className="grid w-full items-center gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="document-category">Document Type</Label>
            <Select
              value={category}
              onValueChange={value => setCategory(value as 'evidence' | 'legal')}
              disabled={uploading}
            >
              <SelectTrigger id="document-category">
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evidence">Evidence</SelectItem>
                <SelectItem value="legal">Legal document</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="file">File</Label>
            <Input
              ref={fileInputRef}
              id="file"
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Upload
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
