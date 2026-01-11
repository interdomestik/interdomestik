'use client';

import type { ClaimStatus } from '@interdomestik/database/constants';
import { Badge } from '@interdomestik/ui/components/badge'; // Adjust import if needed
import { useTranslations } from 'next-intl';

interface ClaimStatusBadgeProps {
  status: ClaimStatus;
  className?: string;
}

const STATUS_VARIANTS: Record<ClaimStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  submitted: 'default',
  verification: 'default', // maybe warning color if available?
  evaluation: 'default',
  negotiation: 'default',
  court: 'destructive',
  resolved: 'default', // success?
  rejected: 'destructive',
};

// TODO: If we have custom colors, use them. For now, map to standard badge variants.

export function ClaimStatusBadge({ status, className }: ClaimStatusBadgeProps) {
  const t = useTranslations('claims.status'); // Ensure keys exist or fallback
  const variant = STATUS_VARIANTS[status] || 'default';

  return (
    <Badge variant={variant} className={className} data-testid="claim-status-badge">
      {t(`${status}`)}
    </Badge>
  );
}
