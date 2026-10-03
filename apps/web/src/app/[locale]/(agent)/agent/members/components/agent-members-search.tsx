'use client';

import { useResponsiveSearch } from '@/hooks/use-responsive-search';
import { useSiblingNavigationCancel } from '@/hooks/use-sibling-navigation-cancel';
import { usePathname, useRouter } from '@/i18n/routing';
import { Input } from '@interdomestik/ui';
import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

type AgentMembersSearchProps = {
  initialQuery?: string;
};

// Agent members search on the shared responsive policy. The param rules are
// unchanged: the trimmed term under 'q', every other param preserved, no page
// reset, and a relative replace so typing never grows the back stack.
export function AgentMembersSearch({ initialQuery = '' }: AgentMembersSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = useCallback(
    (query: string) => router.replace(query ? `?${query}` : '?'),
    [router]
  );

  const { draft, pendingKind, editDraft, cancelScheduledSearch } = useResponsiveSearch({
    searchParams,
    pathname,
    searchKey: 'q',
    initialDraft: initialQuery,
    normalizeTerm: value => value.trim(),
    navigate,
  });

  useSiblingNavigationCancel(cancelScheduledSearch);

  return (
    <Input
      className="w-full border border-border bg-background px-3 py-2 text-sm sm:max-w-xs"
      data-testid="agent-members-search-input"
      disabled={pendingKind === 'filter'}
      placeholder="Search members"
      type="search"
      value={draft}
      onChange={event => editDraft(event.target.value)}
    />
  );
}
