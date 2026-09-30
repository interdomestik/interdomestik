'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { badgeVariants, Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useAdminUsersSearch } from './admin-users-search-provider';

type FilterOption = {
  label: string;
  value: string;
};

function buildAdminUsersUrl(
  currentParams: URLSearchParams,
  updates: Record<string, string | null>
): string {
  const params = new URLSearchParams(currentParams.toString());
  params.delete('page');

  Object.entries(updates).forEach(([key, value]) => {
    const isAllFilterSentinel = (key === 'role' || key === 'assignment') && value === 'all';
    const shouldDelete = value === null || value === '' || isAllFilterSentinel;

    if (shouldDelete) {
      params.delete(key);
      return;
    }

    params.set(key, value);
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}

function FilterButtonGroup({
  activeValue,
  isNavigationPending,
  label,
  onSelect,
  options,
  testIdPrefix,
}: {
  activeValue: string;
  isNavigationPending: boolean;
  label: string;
  onSelect: (value: string) => void;
  options: FilterOption[];
  testIdPrefix: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {options.map(option => {
        const isActive = activeValue === option.value;
        const isInert = isNavigationPending || isActive;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            aria-disabled={isInert}
            disabled={isInert}
            data-testid={`${testIdPrefix}-${option.value}`}
            className={cn(
              badgeVariants({ variant: isActive ? 'default' : 'outline' }),
              'transition-all disabled:pointer-events-none disabled:cursor-default disabled:opacity-70',
              isActive
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 border-transparent'
                : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20 text-muted-foreground'
            )}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function UsersFilters({
  hideRole = false,
  hideAssignment = false,
}: {
  hideRole?: boolean;
  hideAssignment?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('admin.users_filters');
  const tCommon = useTranslations('common');

  const currentRole = searchParams.get('role') || 'all';
  const currentAssignment = searchParams.get('assignment') || 'all';

  const search = useAdminUsersSearch();
  if (!search) throw new Error('UsersFilters requires AdminUsersSearchProvider');
  const {
    searchValue,
    setSearchValue,
    submitSearch,
    pendingKind,
    isNavigationPending,
    navigate,
    withDraftSearch,
  } = search;

  const roleOptions = [
    { value: 'all', label: t('roles.all') },
    { value: 'user', label: t('roles.user') },
    { value: 'agent', label: t('roles.agent') },
    { value: 'staff', label: t('roles.staff') },
    { value: 'admin', label: t('roles.admin') },
  ];

  const assignmentOptions = [
    { value: 'all', label: t('assignments.all') },
    { value: 'assigned', label: t('assignments.assigned') },
    { value: 'unassigned', label: t('assignments.unassigned') },
  ];

  const updateParams = (key: 'role' | 'assignment', value: string) => {
    if (
      isNavigationPending ||
      (key === 'role' && currentRole === value) ||
      (key === 'assignment' && currentAssignment === value)
    )
      return;
    navigate(
      withDraftSearch(`${pathname}${buildAdminUsersUrl(searchParams, { [key]: value })}`),
      key
    );
  };

  return (
    <GlassCard
      className="w-full min-w-0 p-4 space-y-4"
      data-testid="admin-users-filter-region"
      aria-busy={isNavigationPending ? 'true' : 'false'}
    >
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('search_placeholder') || `${tCommon('search')}...`}
          className="pl-9 bg-white/5 border-white/10 focus:bg-white/10 transition-colors"
          data-testid="admin-users-search-input"
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            submitSearch();
          }}
        />
      </div>

      {pendingKind ? (
        <div
          data-testid="admin-users-filters-pending"
          role="status"
          aria-live="polite"
          className="text-xs font-medium text-muted-foreground"
        >
          {tCommon('processing')}
        </div>
      ) : null}

      <div className="space-y-3">
        {!hideRole && (
          <FilterButtonGroup
            activeValue={currentRole}
            isNavigationPending={isNavigationPending}
            label={t('labels.role')}
            onSelect={value => updateParams('role', value)}
            options={roleOptions}
            testIdPrefix="admin-users-role-filter"
          />
        )}

        {!hideAssignment && (
          <FilterButtonGroup
            activeValue={currentAssignment}
            isNavigationPending={isNavigationPending}
            label={t('labels.assignment')}
            onSelect={value => updateParams('assignment', value)}
            options={assignmentOptions}
            testIdPrefix="admin-users-assignment-filter"
          />
        )}
      </div>
    </GlassCard>
  );
}
