'use client';

import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useAdminUsersSearch } from './admin-users-search-provider';
import { useAdminUsersPendingValue } from './use-admin-users-pending-value';

export type AdminUsersRoleTabOption = {
  readonly value: string;
  readonly label: string;
  readonly href: string;
};

type AdminUsersRoleTabsProps = {
  readonly selectedRole: string;
  readonly options: readonly AdminUsersRoleTabOption[];
};

export function AdminUsersRoleTabs({ selectedRole, options }: AdminUsersRoleTabsProps) {
  const search = useAdminUsersSearch();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const currentParamsString = searchParams.toString();
  const {
    hasPendingValue: isPending,
    pendingValue: pendingHref,
    pendingValueRef: pendingHrefRef,
    updatePendingValue: updatePendingHref,
  } = useAdminUsersPendingValue<string>(`${pathname}?${currentParamsString}`);

  const navigationPending = search?.isNavigationPending ?? isPending;

  return (
    <div
      className="w-full min-w-0 space-y-2"
      data-testid="admin-users-role-tabs"
      aria-busy={navigationPending ? 'true' : 'false'}
    >
      <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg bg-muted/60 p-1">
        {options.map(option => {
          const isActive = selectedRole === option.value;
          const isActiveInert = isActive && !search?.hasRetainedFilterTarget('role');
          const isInert = isActiveInert || navigationPending;

          return (
            <Button
              key={option.value}
              asChild={!isActiveInert}
              disabled={isActiveInert}
              size="sm"
              variant={isActive ? 'default' : 'ghost'}
              className={cn('rounded-md', isInert && !isActive && 'pointer-events-none opacity-70')}
            >
              {isActiveInert ? (
                option.label
              ) : (
                <Link
                  href={search?.withDraftSearch(option.href, 'role') ?? option.href}
                  aria-disabled={isInert ? 'true' : undefined}
                  data-testid={`admin-users-role-tab-${option.value}`}
                  tabIndex={isInert ? -1 : undefined}
                  onClick={event => {
                    if (navigationPending || pendingHrefRef.current || isActiveInert) {
                      event.preventDefault();
                      return;
                    }
                    if (search) {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      search.navigate(search.withDraftSearch(option.href, 'role'), 'role');
                    } else updatePendingHref(option.href);
                  }}
                >
                  {option.label}
                </Link>
              )}
            </Button>
          );
        })}
      </div>

      {search?.pendingKind === 'role' || pendingHref ? (
        <div
          data-testid="admin-users-role-tabs-pending"
          role="status"
          aria-live="polite"
          className="text-xs font-medium text-muted-foreground"
        >
          {tCommon('processing')}
        </div>
      ) : null}
    </div>
  );
}
