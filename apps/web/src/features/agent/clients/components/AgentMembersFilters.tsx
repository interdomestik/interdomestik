'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { useRouter } from '@/i18n/routing';
import { Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function AgentMembersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('agent-members.members.filters');
  const tCommon = useTranslations('common');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentSearch = searchParams.get('search') || '';

  const handleSearch = (value: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('page');
      if (value) {
        params.set('search', value);
      } else {
        params.delete('search');
      }
      router.replace(`?${params.toString()}`);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <GlassCard className="p-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('search_placeholder') || `${tCommon('search')}...`}
          className="pl-9 bg-white/5 border-white/10 focus:bg-white/10 transition-colors"
          defaultValue={currentSearch}
          onChange={e => handleSearch(e.target.value)}
          data-testid="agent-members-search-input"
        />
      </div>
    </GlassCard>
  );
}
