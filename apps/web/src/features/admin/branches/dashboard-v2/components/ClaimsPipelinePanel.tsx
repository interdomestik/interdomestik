'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { useTranslations } from 'next-intl';

interface ClaimsPipelinePanelProps {
  pipeline: {
    status: string;
    count: number;
  }[];
}

const CLAIMS_PIPELINE_ORDER = [
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'in_review',
  'resolved',
  'paid',
  'rejected',
];

const LOCALIZED_CLAIMS_PIPELINE_STATUSES = new Set([
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'resolved',
]);

export function ClaimsPipelinePanel({ pipeline }: Readonly<ClaimsPipelinePanelProps>) {
  const t = useTranslations('admin.branches.pipeline');

  const sorted = [...pipeline].sort((a, b) => {
    return CLAIMS_PIPELINE_ORDER.indexOf(a.status) - CLAIMS_PIPELINE_ORDER.indexOf(b.status);
  });

  return (
    <GlassCard className="min-w-0 h-full flex flex-col">
      <div className="p-4 border-b border-border/50">
        <h3 className="font-semibold">{t('title')}</h3>
      </div>
      <div className="p-4 flex-1 overflow-auto">
        <div className="space-y-2">
          {sorted.map(item => (
            <div
              key={item.status}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm"
              data-testid={`branch-pipeline-${item.status}`}
            >
              <span className="min-w-0 capitalize text-muted-foreground [overflow-wrap:anywhere]">
                {LOCALIZED_CLAIMS_PIPELINE_STATUSES.has(item.status)
                  ? t(`statuses.${item.status}`)
                  : item.status.replaceAll('_', ' ')}
              </span>
              <div className="flex max-w-full flex-wrap items-center gap-2">
                <div className="h-2 w-24 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/50"
                    style={{ width: `${Math.min(100, item.count * 5)}%` }} // Arbitrary scaling for visual
                  />
                </div>
                <span className="font-medium min-w-6 text-right">{item.count}</span>
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">{t('empty')}</p>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
