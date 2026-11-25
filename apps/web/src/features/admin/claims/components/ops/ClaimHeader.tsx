'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import type { NextActionsResult } from '../../components/detail/getNextActions';
import type { ClaimOpsDetail } from '../../types';
import { ClaimHeaderBreadcrumb } from './ClaimHeaderBreadcrumb';
import { ClaimHeaderSummary } from './ClaimHeaderSummary';
import { buildAdminUserProfileHref } from './claim-header-links';

interface ClaimHeaderProps {
  claim: ClaimOpsDetail;
  nextActions: NextActionsResult;
  showAssignee?: boolean;
  locale: string;
}

function resolveRouteLocale(pathname: string | null, fallbackLocale: string): string {
  const routeLocale = pathname?.split('/')[1];
  if (routeLocale && ['en', 'sq', 'mk', 'sr', 'de'].includes(routeLocale)) {
    return routeLocale;
  }

  return fallbackLocale;
}

export function ClaimHeader({
  claim,
  showAssignee = false,
  locale,
}: Omit<ClaimHeaderProps, 'nextActions'>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const memberProfileHref = buildAdminUserProfileHref(claim.memberId, searchParams);
  const activeLocale = resolveRouteLocale(pathname, locale);

  // Construct smart back URL: preserve filters/page, but drop poolAnchor to force refresh
  const createBackUrl = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('poolAnchor');
    params.delete('documentsAfter');
    params.delete('staffAfter');
    params.delete('staffSearch');
    const queryString = params.toString();
    return queryString ? `/admin/claims?${queryString}` : '/admin/claims';
  };

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b pb-4 pt-2 -mx-4 px-4 sm:-mx-8 sm:px-8 mb-6 transition-all">
      <div className="flex flex-col gap-4">
        <ClaimHeaderBreadcrumb
          claim={claim}
          backHref={createBackUrl()}
          memberProfileHref={memberProfileHref}
          activeLocale={activeLocale}
        />

        <ClaimHeaderSummary
          claim={claim}
          showAssignee={showAssignee}
          memberProfileHref={memberProfileHref}
          activeLocale={activeLocale}
        />
      </div>
    </div>
  );
}
