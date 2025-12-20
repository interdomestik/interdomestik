'use client';

import { useRouter } from '@/i18n/routing';
import { Badge, Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function ClaimsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('claims.status');

  const currentStatus = searchParams.get('status') || 'all';
  const currentSearch = searchParams.get('search') || '';

  const statusOptions = [
    { value: 'all', label: tCommon('all') },
    { value: 'draft', label: tStatus('draft') },
    { value: 'submitted', label: tStatus('submitted') },
    { value: 'verification', label: tStatus('verification') },
    { value: 'evaluation', label: tStatus('evaluation') },
    { value: 'negotiation', label: tStatus('negotiation') },
    { value: 'court', label: tStatus('court') },
    { value: 'resolved', label: tStatus('resolved') },
    { value: 'rejected', label: tStatus('rejected') },
  ];

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    if (status === 'all') {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    router.push(`?${params.toString()}`);
  };

  const handleSearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    if (value) {
      params.set('search', value);
    } else {
      params.delete('search');
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`${tCommon('search')}...`}
          className="pl-9"
          defaultValue={currentSearch}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      {/* Status Filter */}
      <div className="flex flex-wrap gap-2">
        {statusOptions.map(option => {
          const isActive = currentStatus === option.value;
          return (
            <Badge
              key={option.value}
              variant={isActive ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={() => handleStatusChange(option.value)}
            >
              {option.label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
