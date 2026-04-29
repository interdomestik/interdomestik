'use client';

import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
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

  return (
    <div
      className="w-full min-w-0 space-y-2"
      data-testid="admin-users-role-tabs"
      aria-busy={isPending ? 'true' : 'false'}
    >
      <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg bg-muted/60 p-1">
        {options.map(option => {
          const isActive = selectedRole === option.value;
          const isInert = isActive || isPending;

          return (
            <Button
              key={option.value}
              asChild={!isActive}
              disabled={isActive}
              size="sm"
              variant={isActive ? 'default' : 'ghost'}
              className={cn('rounded-md', isInert && !isActive && 'pointer-events-none opacity-70')}
            >
              {isActive ? (
                option.label
              ) : (
                <Link
                  href={option.href}
                  aria-disabled={isInert ? 'true' : undefined}
                  data-testid={`admin-users-role-tab-${option.value}`}
                  tabIndex={isInert ? -1 : undefined}
                  onClick={event => {
                    if (pendingHrefRef.current || isActive) {
                      event.preventDefault();
                      return;
                    }
                    updatePendingHref(option.href);
                  }}
                >
                  {option.label}
                </Link>
              )}
            </Button>
          );
        })}
      </div>

      {pendingHref ? (
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
