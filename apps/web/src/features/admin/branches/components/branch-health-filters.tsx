import { OpsFiltersBar, type OpsFilterTab } from '@/components/ops';
import { Checkbox } from '@interdomestik/ui/components/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { useTranslations } from 'next-intl';

export interface BranchFiltersState {
  search: string;
  status: 'all' | 'active' | 'inactive';
  needsAttention: boolean;
  sortBy:
    | 'name_asc'
    | 'open_claims_desc'
    | 'cash_pending_desc'
    | 'sla_breaches_desc'
    | 'health_score_asc';
}

interface BranchHealthFiltersProps {
  filters: BranchFiltersState;
  onFilterChange: (filters: BranchFiltersState) => void;
}

export function BranchHealthFilters({ filters, onFilterChange }: BranchHealthFiltersProps) {
  const t = useTranslations('admin.branches');

  const updateFilter = <K extends keyof BranchFiltersState>(
    key: K,
    value: BranchFiltersState[K]
  ) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const tabs: OpsFilterTab[] = [
    { id: 'all', label: t('filter_all') },
    { id: 'active', label: t('status.active') },
    { id: 'inactive', label: t('status.inactive') },
  ];

  const rightActions = (
    <div className="flex items-center gap-3">
      {/* Sort Select */}
      <Select
        value={filters.sortBy}
        onValueChange={val => updateFilter('sortBy', val as BranchFiltersState['sortBy'])}
      >
        <SelectTrigger className="w-[180px] bg-background/50 border-white/10">
          <SelectValue placeholder={t('sort_label')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name_asc">{t('sort_name_asc')}</SelectItem>
          <SelectItem value="open_claims_desc">{t('sort_open_claims_desc')}</SelectItem>
          <SelectItem value="cash_pending_desc">{t('sort_cash_pending_desc')}</SelectItem>
          <SelectItem value="sla_breaches_desc">{t('sort_sla_breaches_desc')}</SelectItem>
          <SelectItem value="health_score_asc">{t('sort_health_score_asc')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Needs Attention Toggle */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-background/50">
        <Checkbox
          id="attention-mode"
          checked={filters.needsAttention}
          onCheckedChange={(val: boolean) => updateFilter('needsAttention', val)}
        />
        <label htmlFor="attention-mode" className="text-sm cursor-pointer whitespace-nowrap">
          {t('filter_attention')}
        </label>
      </div>
    </div>
  );

  return (
    <div className="mb-6">
      <OpsFiltersBar
        tabs={tabs}
        activeTab={filters.status}
        onTabChange={tabId => updateFilter('status', tabId as BranchFiltersState['status'])}
        searchQuery={filters.search}
        onSearchChange={val => updateFilter('search', val)}
        searchPlaceholder={t('search_placeholder')}
        rightActions={rightActions}
      />
    </div>
  );
}
