import { Badge } from '@interdomestik/ui';
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { CashVerificationRequestDTO } from '../../server/types';

interface VerificationStatusSpineProps {
  status: CashVerificationRequestDTO['status'];
  isResubmission?: boolean;
  compact?: boolean;
}

/**
 * Visual variant based on status context.
 */
function getSpineVariant(status: string, isResubmission?: boolean) {
  if (isResubmission && status === 'pending') {
    return {
      containerClass: 'border-purple-500/30 bg-purple-500/5',
      badgeClass: 'font-semibold text-purple-600 border-purple-200 bg-purple-100',
      badgeVariant: 'outline' as const,
      icon: Clock,
      labelKey: 'resubmitted',
    };
  }

  switch (status) {
    case 'succeeded':
      return {
        containerClass: 'border-green-500/30 bg-green-500/5',
        badgeClass: 'font-medium text-green-700 border-green-200 bg-green-100',
        badgeVariant: 'outline' as const,
        icon: CheckCircle,
        labelKey: 'succeeded',
      };
    case 'rejected':
      return {
        containerClass: 'border-red-500/30 bg-red-500/5',
        badgeClass: 'font-medium text-red-700 border-red-200 bg-red-100',
        badgeVariant: 'outline' as const,
        icon: XCircle,
        labelKey: 'rejected',
      };
    case 'needs_info':
      return {
        containerClass: 'border-orange-500/30 bg-orange-500/5',
        badgeClass: 'font-semibold text-orange-700 border-orange-200 bg-orange-100',
        badgeVariant: 'outline' as const,
        icon: AlertTriangle,
        labelKey: 'needs_info',
      };
    default: // pending
      return {
        containerClass: 'border-blue-500/30 bg-blue-500/5',
        badgeClass: 'font-medium text-blue-700 border-blue-200 bg-blue-50',
        badgeVariant: 'outline' as const,
        icon: Clock,
        labelKey: 'pending',
      };
  }
}

export function VerificationStatusSpine({
  status,
  isResubmission,
  compact,
}: VerificationStatusSpineProps) {
  const t = useTranslations('admin.leads.status');

  const variant = getSpineVariant(status, isResubmission);
  // const IconComponent = variant.icon;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border transition-colors',
        compact ? 'min-w-[84px] py-1 gap-0.5' : 'min-w-[96px] md:min-w-[112px] gap-1.5 p-2',
        variant.containerClass
      )}
    >
      <Badge
        variant={variant.badgeVariant}
        className={cn('text-xs truncate max-w-full', variant.badgeClass)}
        data-status={variant.labelKey}
      >
        {t(variant.labelKey)}
      </Badge>
    </div>
  );
}
