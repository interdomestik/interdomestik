'use client';

import { OpsEmptyState } from '@/components/ops';
import { BranchWithKpis } from '@/features/admin/branches/server/getBranchesWithKpis';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { analyzeBranchRisk } from '../utils/branch-risk';
import { BranchHealthCard } from './branch-health-card';
import { BranchFiltersState, BranchHealthFilters } from './branch-health-filters';

interface BranchHealthViewProps {
  initialBranches: BranchWithKpis[];
}

export function BranchHealthView({ initialBranches }: BranchHealthViewProps) {
  const t = useTranslations('admin.branches');

  const [filters, setFilters] = useState<BranchFiltersState>({
    search: '',
    status: 'all',
    needsAttention: false,
    sortBy: 'name_asc',
  });

  const filteredBranches = useMemo(() => {
    let result = [...initialBranches];

    // 1. Search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        b => b.name.toLowerCase().includes(q) || (b.code && b.code.toLowerCase().includes(q))
      );
    }

    // 2. Status
    if (filters.status !== 'all') {
      const isActive = filters.status === 'active';
      result = result.filter(b => b.isActive === isActive);
    }

    // 3. Needs Attention (Risk-based)
    if (filters.needsAttention) {
      result = result.filter(b => {
        const { severity } = analyzeBranchRisk(b);
        return severity === 'urgent' || severity === 'watch';
      });
    }

    // 4. Sort
    result.sort((a, b) => {
      switch (filters.sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'open_claims_desc':
          return (b.kpis?.openClaims ?? 0) - (a.kpis?.openClaims ?? 0);
        case 'cash_pending_desc':
          return (b.kpis?.cashPending ?? 0) - (a.kpis?.cashPending ?? 0);
        case 'sla_breaches_desc':
          return (b.kpis?.slaBreaches ?? 0) - (a.kpis?.slaBreaches ?? 0);
        case 'health_score_asc': {
          const scoreA = analyzeBranchRisk(a).healthScore;
          const scoreB = analyzeBranchRisk(b).healthScore;
          return scoreA - scoreB; // Worst first (lower score is worse)
        }
        default:
          return 0;
      }
    });

    return result;
  }, [initialBranches, filters]);

  return (
    <div className="space-y-6">
      <BranchHealthFilters filters={filters} onFilterChange={setFilters} />

      <div className="flex items-center justify-between px-2 text-sm text-muted-foreground pb-2 border-b border-white/5">
        <span>{t('list_description', { count: filteredBranches.length })}</span>
      </div>

      {filteredBranches.length === 0 ? (
        <OpsEmptyState
          title={t('no_branches')}
          subtitle={t('no_branches_subtitle', { defaultValue: 'Try adjusting your filters' })}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredBranches.map(branch => (
            <BranchHealthCard key={branch.id} branch={branch} />
          ))}
        </div>
      )}
    </div>
  );
}
