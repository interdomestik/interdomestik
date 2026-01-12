'use client';

import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { LifecycleStage, LifecycleStats } from '../types';

interface ClaimsLifecycleTabsProps {
  stats: LifecycleStats;
  currentStage?: LifecycleStage;
}

const LIFECYCLE_STAGES: LifecycleStage[] = [
  'intake',
  'verification',
  'processing',
  'negotiation',
  'legal',
  'completed',
];

export function ClaimsLifecycleTabs({ stats, currentStage }: ClaimsLifecycleTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('admin.claims_page.lifecycle_tabs');

  const handleTabChange = (stage: LifecycleStage | 'all') => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page'); // Reset pagination
    params.delete('poolAnchor'); // Reset pool anchor for new filter context

    if (stage === 'all') {
      params.delete('lifecycle');
    } else {
      params.set('lifecycle', stage);
    }

    router.push(`?${params.toString()}`);
  };

  const isActive = (stage: LifecycleStage | 'all') => {
    if (stage === 'all') return !currentStage;
    return currentStage === stage;
  };

  const totalCount = Object.values(stats).reduce((sum, count) => sum + count, 0);

  return (
    <div
      className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-black/20 border border-white/5"
      data-testid="claims-lifecycle-tabs"
    >
      {/* All tab */}
      <button
        onClick={() => handleTabChange('all')}
        className={`
          px-3 py-1.5 rounded-lg text-sm font-medium transition-all
          ${
            isActive('all')
              ? 'bg-background shadow-sm text-foreground ring-1 ring-white/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
          }
        `}
        data-testid="lifecycle-tab-all"
      >
        {t('all')} ({totalCount})
      </button>

      {/* Lifecycle stage tabs */}
      {LIFECYCLE_STAGES.map(stage => {
        const count = stats[stage];
        return (
          <button
            key={stage}
            onClick={() => handleTabChange(stage)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium transition-all
              ${
                isActive(stage)
                  ? 'bg-background shadow-sm text-foreground ring-1 ring-white/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }
            `}
            data-testid={`lifecycle-tab-${stage}`}
          >
            {t(stage)} {count > 0 && `(${count})`}
          </button>
        );
      })}
    </div>
  );
}
