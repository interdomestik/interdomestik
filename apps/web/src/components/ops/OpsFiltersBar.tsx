'use client';

import { Button, Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { OPS_TEST_IDS } from './testids';

export type OpsFilterTab = {
  id: string;
  label: string;
  icon?: ReactNode;
  testId?: string;
  href?: string;
};

interface OpsFiltersBarProps {
  tabs: OpsFilterTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder: string;
  searchInputTestId?: string;
  rightActions?: ReactNode;
  className?: string;
}

export function OpsFiltersBar({
  tabs,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  searchInputTestId,
  rightActions,
  className,
}: Readonly<OpsFiltersBarProps>) {
  const containerClasses = [
    'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg border border-white/5 bg-card/30 backdrop-blur-sm',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses} data-testid={OPS_TEST_IDS.FILTERS.BAR}>
      <div className="flex gap-2">
        {tabs.map(tab =>
          tab.href ? (
            <Button
              key={tab.id}
              asChild
              variant={tab.id === activeTab ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
            >
              <Link
                href={tab.href}
                scroll={false}
                prefetch={false}
                data-testid={tab.testId ?? OPS_TEST_IDS.FILTERS.TAB(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </Link>
            </Button>
          ) : (
            <Button
              key={tab.id}
              variant={tab.id === activeTab ? 'default' : 'outline'}
              size="sm"
              type="button"
              onClick={event => {
                event.preventDefault();
                onTabChange(tab.id);
              }}
              className="gap-2"
              data-testid={tab.testId ?? OPS_TEST_IDS.FILTERS.TAB(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </Button>
          )
        )}
      </div>
      <div className="flex w-full sm:w-auto items-center gap-3">
        <div className="relative w-full sm:w-auto sm:min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={event => onSearchChange(event.target.value)}
            className="pl-9 bg-background/50"
            data-testid={searchInputTestId ?? OPS_TEST_IDS.FILTERS.SEARCH}
            aria-label={searchPlaceholder}
          />
        </div>
        {rightActions}
      </div>
    </div>
  );
}
