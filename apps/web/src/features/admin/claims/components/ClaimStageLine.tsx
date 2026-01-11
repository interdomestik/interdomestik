import { useTranslations } from 'next-intl';
import type { LifecycleStage } from '../types';

interface ClaimStageLineProps {
  stage: LifecycleStage;
  daysInStage: number;
}

export function ClaimStageLine({ stage, daysInStage }: ClaimStageLineProps) {
  const tTabs = useTranslations('admin.claims_page.lifecycle_tabs');
  const tTable = useTranslations('admin.claims_page.table.row');

  const stageLabel = tTabs(stage);

  return (
    <div className="text-xs text-muted-foreground">
      {tTable('stage_line', { stage: stageLabel, days: daysInStage })}
    </div>
  );
}
