'use client';

import { Button, Input } from '@interdomestik/ui';
import { Clock, History, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface VerificationFiltersBarProps {
  view: 'queue' | 'history';
  onViewChange: (view: 'queue' | 'history') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function VerificationFiltersBar({
  view,
  onViewChange,
  searchQuery,
  onSearchChange,
}: VerificationFiltersBarProps) {
  const t = useTranslations('admin.leads');

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg border border-white/5 bg-card/30 backdrop-blur-sm">
      {/* Tab Buttons */}
      <div className="flex gap-2">
        <Button
          variant={view === 'queue' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('queue')}
          className="gap-2"
          data-testid="view-queue"
        >
          <Clock className="w-4 h-4" />
          {t('tabs.queue')}
        </Button>
        <Button
          variant={view === 'history' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('history')}
          className="gap-2"
          data-testid="view-history"
        >
          <History className="w-4 h-4" />
          {t('tabs.history')}
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative w-full sm:w-auto sm:min-w-[280px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t('search_placeholder')}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9 bg-background/50"
        />
      </div>
    </div>
  );
}
