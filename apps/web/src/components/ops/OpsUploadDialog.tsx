'use client';

import { confirmUpload, generateUploadUrl } from '@/actions/documents';
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
} from '@interdomestik/ui';
import { Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface OpsUploadDialogProps {
  entityType: 'claim' | 'member';
  entityId: string;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

export function OpsUploadDialog({
  entityType,
  entityId,
  trigger,
  onSuccess,
}: OpsUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    try {
      // 1. Get Presigned URL
      const genResult = await generateUploadUrl(
        entityType,
        entityId,
        file.name,
        file.type || 'application/octet-stream',
        file.size
      );

      if (!genResult.success) {
        throw new Error(genResult.error);
      }

      // 2. Upload to Storage
      // Supabase createSignedUploadUrl returns a URL that you can PUT to.
      // It includes the token in the URL query params typically.
      const uploadRes = await fetch(genResult.url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
      });

      if (!uploadRes.ok) {
        throw new Error(`Storage upload failed: ${uploadRes.statusText}`);
      }

      // 3. Confirm in DB
      const confirmRes = await confirmUpload(
        genResult.id,
        entityType,
        entityId,
        file.name,
        file.type || 'application/octet-stream',
        file.size,
        genResult.path
      );

      if (!confirmRes.success) {
        throw new Error(confirmRes.error);
      }

      toast.success('Document uploaded successfully');
      setOpen(false);
      setFile(null);
      router.refresh();
      onSuccess?.();
    } catch (err: any) {
      console.error('Upload flow error:', err);
      toast.error(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Choose a file to upload. Supported formats: PDF, Images, Audio (max 50MB).
          </DialogDescription>
        </DialogHeader>
        <div className="grid w-full items-center gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="file">File</Label>
            <Input id="file" type="file" onChange={handleFileChange} disabled={uploading} />
          </div>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button
            type="button"
            variant="default"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
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
