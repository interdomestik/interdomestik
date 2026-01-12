import { Badge } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import type { LifecycleStage } from '../types';

interface ClaimStageLineProps {
  stage: LifecycleStage;
  daysInStage: number;
  isStuck?: boolean;
  hasSlaBreach?: boolean;
}

/**
 * Stage badge styled for visual dominance.
 * Risk states override normal styling.
 */
export function ClaimStageLine({
  stage,
  daysInStage,
  isStuck = false,
  hasSlaBreach = false,
}: ClaimStageLineProps) {
  const tTabs = useTranslations('admin.claims_page.lifecycle_tabs');

  const stageLabel = tTabs(stage);

  // Determine styling based on risk state
  let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';
  let badgeClasses = 'font-semibold';

  if (hasSlaBreach) {
    badgeVariant = 'destructive';
    badgeClasses = 'font-bold animate-pulse';
  } else if (isStuck) {
    badgeVariant = 'outline';
    badgeClasses = 'font-semibold border-amber-500 text-amber-500';
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant={badgeVariant} className={badgeClasses}>
        {stageLabel}
      </Badge>
      <span className="text-xs font-medium text-muted-foreground">{daysInStage}d</span>
    </div>
  );
}
