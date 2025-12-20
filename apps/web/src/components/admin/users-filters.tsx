'use client';

import { useRouter } from '@/i18n/routing';
import { Badge, Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function UsersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('admin.users_filters');
  const tCommon = useTranslations('common');

  const currentRole = searchParams.get('role') || 'all';
  const currentAssignment = searchParams.get('assignment') || 'all';
  const currentSearch = searchParams.get('search') || '';

  const roleOptions = [
    { value: 'all', label: t('roles.all') },
    { value: 'user', label: t('roles.user') },
    { value: 'agent', label: t('roles.agent') },
    { value: 'staff', label: t('roles.staff') },
    { value: 'admin', label: t('roles.admin') },
  ];

  const assignmentOptions = [
    { value: 'all', label: t('assignments.all') },
    { value: 'assigned', label: t('assignments.assigned') },
    { value: 'unassigned', label: t('assignments.unassigned') },
  ];

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    if (value === 'all' || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
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
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('search_placeholder') || `${tCommon('search')}...`}
          className="pl-9"
          defaultValue={currentSearch}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('labels.role')}
          </span>
          {roleOptions.map(option => {
            const isActive = currentRole === option.value;
            return (
              <Badge
                key={option.value}
                variant={isActive ? 'default' : 'outline'}
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => updateParams('role', option.value)}
              >
                {option.label}
              </Badge>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('labels.assignment')}
          </span>
          {assignmentOptions.map(option => {
            const isActive = currentAssignment === option.value;
            return (
              <Badge
                key={option.value}
                variant={isActive ? 'default' : 'outline'}
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => updateParams('assignment', option.value)}
              >
                {option.label}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
