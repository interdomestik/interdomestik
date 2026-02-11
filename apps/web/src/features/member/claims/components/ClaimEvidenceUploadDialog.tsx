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
} from '@interdomestik/ui';
import { Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ClaimEvidenceUploadDialogProps {
  claimId: string;
  trigger: React.ReactNode;
}

export function ClaimEvidenceUploadDialog({ claimId, trigger }: ClaimEvidenceUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

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
        claimId,
        file.name,
        file.type || 'application/octet-stream',
        file.size
      );

      if (!genResult.success) {
        throw new Error(genResult.error);
      }

      if (!supabase) {
        throw new Error('Storage upload unavailable');
      }

      // 2. Upload to Storage via signed upload token.
      const { error: uploadError } = await supabase.storage
        .from(genResult.bucket)
        .uploadToSignedUrl(genResult.path, genResult.token, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Storage upload failed');
      }

      // 3. Confirm in DB
      const confirmRes = await confirmUpload(
        claimId,
        genResult.path,
        file.name,
        file.type || 'application/octet-stream',
        file.size,
        genResult.id,
        genResult.bucket
      );

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
            <Label htmlFor="file">File</Label>
            <Input
              id="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,text/plain"
              onChange={handleFileChange}
              disabled={uploading}
            />
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
