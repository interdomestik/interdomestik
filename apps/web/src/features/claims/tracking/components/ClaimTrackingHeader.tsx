'use client';

import type { ClaimStatus } from '@interdomestik/database/constants';
import { Button } from '@interdomestik/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@interdomestik/ui/dialog';
import { Input } from '@interdomestik/ui/input';
import { Label } from '@interdomestik/ui/label';
import { Copy, Loader2, Share } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { createPublicTrackingLink } from '@/actions/claims-tracking';
import { ClaimStatusBadge } from './ClaimStatusBadge';

interface ClaimTrackingHeaderProps {
  claimId: string;
  title: string;
  status: ClaimStatus;
  canShare: boolean;
}

export function ClaimTrackingHeader({
  claimId,
  title,
  status,
  canShare,
}: ClaimTrackingHeaderProps) {
  const t = useTranslations('claims-tracking.tracking.header');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');

  const handleShare = async () => {
    setLoading(true);
    try {
      const result = await createPublicTrackingLink(claimId);
      setLink(result.url);
      setOpen(true);
    } catch (error) {
      toast.error(t('error_generating_link'), {
        description: (error as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(link);
    toast.success(t('link_copied'));
  };

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6 mb-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="claim-tracking-title">
          {title}
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-mono">#{claimId.slice(0, 8)}</span>
          <ClaimStatusBadge status={status} />
        </div>
      </div>

      {canShare && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            disabled={loading}
            data-testid="share-tracking-link"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Share className="mr-2 h-4 w-4" />
            )}
            {t('share_link')}
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('share_dialog_title')}</DialogTitle>
                <DialogDescription>{t('share_dialog_desc')}</DialogDescription>
              </DialogHeader>
              <div className="flex items-center space-x-2">
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="link" className="sr-only">
                    Link
                  </Label>
                  <Input id="link" defaultValue={link} readOnly />
                </div>
                <Button type="submit" size="sm" className="px-3" onClick={copyToClipboard}>
                  <span className="sr-only">Copy</span>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
