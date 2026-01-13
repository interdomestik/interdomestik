// Phase 2.8: Claim Preview Drawer Component
'use client';

import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton } from '@interdomestik/ui';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Link } from '@/i18n/routing';
import type { ClaimOperationalRow } from '../../types';

interface ClaimPreviewDrawerProps {
  claim: ClaimOperationalRow | null;
  onClose: () => void;
}

/**
 * ClaimPreviewDrawer — Right pane preview with lazy loading.
 * Loads claim details only when opened.
 */
export function ClaimPreviewDrawer({ claim, onClose }: ClaimPreviewDrawerProps) {
  const t = useTranslations('admin.claims_page.ops_center');
  const [isLoading, setIsLoading] = useState(true);

  // Simulate lazy load (replace with actual data fetch)
  useEffect(() => {
    if (claim) {
      setIsLoading(true);
      const timer = setTimeout(() => setIsLoading(false), 300);
      return () => clearTimeout(timer);
    }
  }, [claim?.id]);

  return (
    <Sheet open={!!claim} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-[360px] sm:w-[400px]" data-testid="claim-preview-drawer">
        <SheetHeader>
          <SheetTitle>{claim?.code ?? ''}</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 mt-6" data-testid="preview-skeleton">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <div className="space-y-6 mt-6">
            {/* Claim Info */}
            <div className="space-y-2">
              <p className="text-sm font-medium">{claim?.title}</p>
              <p className="text-sm text-muted-foreground">{claim?.memberName}</p>
              <p className="text-sm text-muted-foreground">{claim?.memberEmail}</p>
              {claim?.memberNumber && (
                <p className="text-xs text-amber-700/80 font-mono mt-0.5">{claim.memberNumber}</p>
              )}
            </div>

            {/* Status Info */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {claim?.lifecycleStage} • {claim?.daysInStage} days
              </p>
            </div>

            {/* Open Full Detail Link */}
            <Button asChild className="w-full">
              <Link href={`/admin/claims/${claim?.id}`}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('preview.open_full')}
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
