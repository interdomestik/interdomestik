'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Input } from '@interdomestik/ui';
import { useRouter } from '@/i18n/routing';

type AgentMembersSearchProps = {
  initialQuery?: string;
};

export function AgentMembersSearch({ initialQuery = '' }: AgentMembersSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState(initialQuery);

  useEffect(() => {
    const delay = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = searchTerm.trim();

      if (trimmed) {
        params.set('q', trimmed);
      } else {
        params.delete('q');
      }

      const nextQuery = params.toString();
      const currentQuery = searchParams.toString();

      if (nextQuery !== currentQuery) {
        startTransition(() => {
          router.replace(nextQuery ? `?${nextQuery}` : '?');
        });
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [router, searchParams, searchTerm]);

  return (
    <Input
      className="w-full border border-border bg-background px-3 py-2 text-sm sm:max-w-xs"
      data-testid="agent-members-search-input"
      disabled={isPending}
      placeholder="Search members"
      type="search"
      value={searchTerm}
      onChange={event => setSearchTerm(event.target.value)}
    />
  );
}
