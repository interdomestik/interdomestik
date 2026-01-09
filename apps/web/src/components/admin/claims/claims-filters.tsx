'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { useRouter } from '@/i18n/routing';
import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import { Badge, Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

export function AdminClaimsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('claims.status');

  const currentStatus = searchParams.get('status') || 'all';
  const currentSearch = searchParams.get('search') || '';

  const statusOptions = [
    { value: 'all', label: tCommon('all') },
    ...CLAIM_STATUSES.map(status => ({ value: status, label: tStatus(status) })),
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
    <GlassCard className="p-4 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`${tCommon('search')}...`}
          className="pl-9 bg-white/5 border-white/10 focus:bg-white/10 transition-colors"
          defaultValue={currentSearch}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {statusOptions.map(option => {
          const isActive = currentStatus === option.value;
          return (
            <Badge
              key={option.value}
              variant={isActive ? 'default' : 'outline'}
              className={`cursor-pointer transition-all ${
                isActive
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 border-transparent'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20 text-muted-foreground'
              }`}
              onClick={() => handleStatusChange(option.value)}
            >
              {option.label}
            </Badge>
          );
        })}
      </div>
    </GlassCard>
  );
}
