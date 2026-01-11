'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { useTranslations } from 'next-intl';

interface ClaimsPipelinePanelProps {
  pipeline: {
    status: string;
    count: number;
  }[];
}

export function ClaimsPipelinePanel({ pipeline }: ClaimsPipelinePanelProps) {
  const t = useTranslations('admin.branches.pipeline');

  // Sort order or predefined buckets?
  // Let's rely on server order or consistent client order.
  const ORDER = [
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

  const sorted = [...pipeline].sort((a, b) => {
    return ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
  });

  return (
    <GlassCard className="h-full flex flex-col">
      <div className="p-4 border-b border-border/50">
        <h3 className="font-semibold">{t('title')}</h3>
      </div>
      <div className="p-4 flex-1 overflow-auto">
        <div className="space-y-2">
          {sorted.map(item => (
            <div key={item.status} className="flex items-center justify-between text-sm">
              <span className="capitalize text-muted-foreground">
                {item.status.replace('_', ' ')}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/50"
                    style={{ width: `${Math.min(100, item.count * 5)}%` }} // Arbitrary scaling for visual
                  />
                </div>
                <span className="font-medium w-6 text-right">{item.count}</span>
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
