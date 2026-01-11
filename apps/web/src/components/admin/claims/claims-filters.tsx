'use client';

import { useRouter } from '@/i18n/routing';
import { Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

export function AdminClaimsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tAdmin = useTranslations('admin.claims_page');
  const tCommon = useTranslations('common');

  const currentSearch = searchParams.get('search') || '';
  const currentStatus = searchParams.get('status') || 'all';
  const currentAssignment = searchParams.get('assigned') || 'all';

  // V2 Status Tabs
  const statusOptions = [
    { value: 'active', label: tAdmin('sections.active') },
    { value: 'draft', label: tAdmin('sections.draft') },
    { value: 'closed', label: tAdmin('sections.resolved') },
    { value: 'all', label: tCommon('all') },
  ];

  const assignmentOptions = [
    { value: 'all', label: tCommon('all') },
    { value: 'unassigned', label: tAdmin('filters.unassigned_only') }, // Ensure translation key exists or use fallback
    { value: 'me', label: tAdmin('filters.assigned_to_me') },
  ];

  const updateFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page'); // Reset pagination on filter change

    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== 'all') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    router.push(`?${params.toString()}`);
  };

  return (
    <div
      className="flex flex-col lg:flex-row gap-4 p-4 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm"
      data-testid="admin-claims-filters"
    >
      {/* Search */}
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`${tCommon('search')}...`}
          className="pl-9 bg-black/20 border-white/10 focus:bg-black/40 transition-colors h-10"
          defaultValue={currentSearch}
          onChange={e => updateFilters({ search: e.target.value || null })}
        />
      </div>

      <div className="flex flex-1 flex-col sm:flex-row gap-4 items-start sm:items-center justify-between lg:justify-end">
        {/* Assignment Filter - Using Tabs/Buttons style for visibility as per smoke test requirement */}
        {/* Test expects button with text "Të pacaktuara" (Unassigned) */}
        <div className="flex bg-black/20 p-1 rounded-lg border border-white/5">
          {assignmentOptions.map(option => {
            const isActive = currentAssignment === option.value;
            return (
              <button
                key={option.value}
                onClick={() => updateFilters({ assigned: option.value })}
                className={`
                            px-3 py-1.5 rounded-md text-sm font-medium transition-all
                            ${
                              isActive
                                ? 'bg-background shadow-sm text-foreground ring-1 ring-white/10'
                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                            }
                        `}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {/* Status Filter */}
        <div className="flex flex-wrap gap-1.5 bg-black/20 p-1 rounded-lg border border-white/5">
          {statusOptions.map(option => {
            const isActive = currentStatus === option.value;
            return (
              <button
                key={option.value}
                onClick={() => updateFilters({ status: option.value })}
                className={`
                  px-3 py-1.5 rounded-md text-sm font-medium transition-all
                  ${
                    isActive
                      ? 'bg-background shadow-sm text-foreground ring-1 ring-white/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  }
                `}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
