'use client';

import { confirmAdminUpload, generateAdminUploadUrl } from '@/features/admin/claims/actions';
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
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  EVIDENCE_FILE_ACCEPT,
  resolveStorageUploadContentType,
  resolveUploadMimeType,
} from './file-upload-meta';

interface AdminClaimEvidenceUploadDialogProps {
  claimId: string;
  trigger: React.ReactNode;
}

export function AdminClaimEvidenceUploadDialog({
  claimId,
  trigger,
}: AdminClaimEvidenceUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<'evidence' | 'legal'>('evidence');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('admin.claims_page.evidence');
  const tCommon = useTranslations('common');
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
          throw new Error(body?.error || t('upload_failed'));
        }

        toast.success(t('upload_success'));
        setOpen(false);
        setFile(null);
        router.refresh();
        return;
      }

      const genResult = await generateAdminUploadUrl(
        claimId,
        file.name,
        resolvedMimeType,
        file.size
      );

      if (!genResult.success) {
        throw new Error(genResult.error);
      }

      if (!supabase) {
        throw new Error(t('upload_failed'));
      }

      const { error: uploadError } = await supabase.storage
        .from(genResult.bucket)
        .uploadToSignedUrl(genResult.path, genResult.token, uploadFile, {
          contentType: storageContentType,
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) {
        throw new Error(uploadError.message || t('upload_failed'));
      }

      const confirmRes = await confirmAdminUpload({
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

      toast.success(t('upload_success'));
      setOpen(false);
      setFile(null);
      router.refresh();
    } catch (error) {
      console.error('[admin/claims] upload flow error', error);
      toast.error(error instanceof Error ? error.message : t('upload_failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialog_title')}</DialogTitle>
          <DialogDescription>{t('dialog_description')}</DialogDescription>
        </DialogHeader>
        <div className="grid w-full items-center gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="admin-document-category">{t('document_type_label')}</Label>
            <Select
              value={category}
              onValueChange={value => setCategory(value as 'evidence' | 'legal')}
              disabled={uploading}
            >
              <SelectTrigger id="admin-document-category">
                <SelectValue placeholder={t('document_type_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evidence">{t('types.evidence')}</SelectItem>
                <SelectItem value="legal">{t('types.legal')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="admin-evidence-file">{t('file_label')}</Label>
            <Input
              ref={fileInputRef}
              id="admin-evidence-file"
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('uploading')}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> {t('upload_button')}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={uploading}
          >
            {tCommon('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
