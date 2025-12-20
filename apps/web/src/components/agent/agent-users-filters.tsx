'use client';

import { useRouter } from '@/i18n/routing';
import { Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function AgentUsersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const t = useTranslations('agent.users_filters');

  const currentSearch = searchParams.get('search') || '';

  const handleSearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('search', value);
    } else {
      params.delete('search');
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={t('search_placeholder') || `${tCommon('search')}...`}
        className="pl-9"
        defaultValue={currentSearch}
        onChange={e => handleSearch(e.target.value)}
      />
    </div>
  );
}
