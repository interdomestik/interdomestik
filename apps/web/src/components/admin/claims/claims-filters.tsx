'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { OpsFiltersBar } from '@/components/ops';

export function AdminClaimsFilters() {
  const router = useRouter();
  const pathname = usePathname();
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
    const currentView = searchParams.get('view');

    params.delete('page'); // Reset pagination on filter change

    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== 'all') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    // Preserve view if present, so we don't drop out of list mode
    if (currentView) {
      params.set('view', currentView);
    }

    const query = params.toString();
    const targetUrl = `${pathname}${query ? `?${query}` : ''}`;
    router.push(targetUrl);
  };

  return (
    <div data-testid="admin-claims-filters">
      <OpsFiltersBar
        tabs={statusOptions.map(option => ({
          id: option.value,
          label: option.label,
          testId: `status-filter-${option.value}`,
        }))}
        activeTab={currentStatus}
        onTabChange={tabId => updateFilters({ status: tabId })}
        searchQuery={currentSearch}
        onSearchChange={query => updateFilters({ search: query || null })}
        searchPlaceholder={`${tCommon('search')}...`}
        searchInputTestId="claims-search-input"
        rightActions={
          <div className="flex bg-black/20 p-1 rounded-lg border border-white/5">
            {assignmentOptions.map(option => {
              const isActive = currentAssignment === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => updateFilters({ assigned: option.value })}
                  type="button"
                  aria-pressed={isActive}
                  data-state={isActive ? 'on' : 'off'}
                  data-testid={`assigned-filter-${option.value}`}
                  className={[
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                    isActive
                      ? 'bg-background shadow-sm text-foreground ring-1 ring-white/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        }
        className="rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm"
      />
    </div>
  );
}
