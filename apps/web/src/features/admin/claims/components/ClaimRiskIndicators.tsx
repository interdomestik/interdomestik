import { AlertTriangle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ClaimRiskIndicatorsProps {
  isStuck: boolean;
  hasSlaBreach: boolean;
  hasCashPending: boolean;
}

export function ClaimRiskIndicators({
  isStuck,
  hasSlaBreach,
  hasCashPending,
}: ClaimRiskIndicatorsProps) {
  const t = useTranslations('admin.claims_page.indicators');

  if (!isStuck && !hasSlaBreach && !hasCashPending) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      {isStuck && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {t('stuck')}
        </span>
      )}
      {hasSlaBreach && !isStuck && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {t('sla_breach')}
        </span>
      )}
      {hasCashPending && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
          {t('cash_pending')}
        </span>
      )}
    </div>
  );
}
