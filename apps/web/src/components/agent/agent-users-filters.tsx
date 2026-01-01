'use client';

import { useRouter } from '@/i18n/routing';
import { Input } from '@interdomestik/ui';
import { Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

export function AgentUsersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const t = useTranslations('agent-members.members.filters');
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (searchTerm) {
        params.set('search', searchTerm);
      } else {
        params.delete('search');
      }

      startTransition(() => {
        router.push(`?${params.toString()}`);
      });
    }, 200); // 200ms debounce for "instant" feel

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, searchParams, router]);

  return (
    <div className="relative">
      {isPending ? (
        <Loader2 className="absolute left-3 top-3 h-4 w-4 text-primary animate-spin" />
      ) : (
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      )}
      <Input
        placeholder={t('search_placeholder') || `${tCommon('search')}...`}
        aria-label={t('search_label') || tCommon('search') || 'Search users'}
        className="pl-9 h-11 border-2 focus-visible:ring-primary shadow-sm"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        autoFocus
      />
    </div>
  );
}
