'use client';

import { useResponsiveSearch } from '@/hooks/use-responsive-search';
import { useSiblingNavigationCancel } from '@/hooks/use-sibling-navigation-cancel';
import { usePathname, useRouter } from '@/i18n/routing';
import { Input } from '@interdomestik/ui';
import { Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

// Agent clients search on the shared responsive policy: the input stays
// editable while its own navigation runs, one typing burst commits once, and
// the param rules are unchanged - the search param only, no page reset and no
// other query context touched.
export function AgentUsersFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const t = useTranslations('agent-members.members.filters');

  const navigate = useCallback(
    (query: string) => router.push(pathname + (query ? `?${query}` : ''), { scroll: false }),
    [pathname, router]
  );

  const { draft, pendingKind, isNavigationPending, editDraft, cancelScheduledSearch } =
    useResponsiveSearch({
      searchParams,
      pathname,
      searchKey: 'search',
      navigate,
    });

  useSiblingNavigationCancel(cancelScheduledSearch);

  return (
    <div
      className="space-y-2"
      data-testid="agent-clients-search-region"
      aria-busy={isNavigationPending ? 'true' : 'false'}
    >
      <div className="relative">
        {isNavigationPending ? (
          <Loader2 className="absolute left-3 top-3 h-4 w-4 text-primary animate-spin" />
        ) : (
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        )}
        <Input
          placeholder={t('search_placeholder') || `${tCommon('search')}...`}
          aria-label={t('search_label') || tCommon('search') || 'Search users'}
          className="pl-9 h-11 border-2 focus-visible:ring-primary shadow-sm"
          data-testid="agent-clients-search-input"
          disabled={pendingKind === 'filter'}
          value={draft}
          onChange={e => editDraft(e.target.value)}
          autoFocus
        />
      </div>

      {pendingKind ? (
        <div
          data-testid="agent-clients-search-pending"
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
