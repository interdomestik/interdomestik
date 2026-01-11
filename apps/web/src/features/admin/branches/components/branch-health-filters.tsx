'use client';

import { Checkbox } from '@interdomestik/ui/components/checkbox';
import { Input } from '@interdomestik/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React from 'react';

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

  return (
    <div className="flex flex-col lg:flex-row gap-4 mb-6 p-4 rounded-xl border border-white/5 bg-white/5">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('search_placeholder')}
          className="pl-9 bg-black/20 border-white/10"
          value={filters.search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            updateFilter('search', e.target.value)
          }
        />
      </div>

      {/* Controls Group */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Status Select */}
        <Select
          value={filters.status}
          onValueChange={val => updateFilter('status', val as BranchFiltersState['status'])}
        >
          <SelectTrigger className="w-[140px] bg-black/20 border-white/10">
            <SelectValue placeholder={t('filter_status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filter_all')}</SelectItem>
            <SelectItem value="active">{t('status.active')}</SelectItem>
            <SelectItem value="inactive">{t('status.inactive')}</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort Select */}
        <Select
          value={filters.sortBy}
          onValueChange={val => updateFilter('sortBy', val as BranchFiltersState['sortBy'])}
        >
          <SelectTrigger className="w-[180px] bg-black/20 border-white/10">
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-black/20">
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
    </div>
  );
}
