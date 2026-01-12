'use client';

import { Badge } from '@interdomestik/ui/components/badge';
import { cn } from '@interdomestik/ui/lib/utils';
import { Shield } from 'lucide-react';
import { useLocale } from 'next-intl';
import { ReactNode } from 'react';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string | ReactNode;
  tenantName?: string;
  actions?: ReactNode;
  className?: string;
}

// Map app locale codes to Intl.DateTimeFormat locale codes
const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  sq: 'sq-AL',
  mk: 'mk-MK',
  sr: 'sr-RS',
};

export function AdminPageHeader({
  title,
  subtitle,
  tenantName,
  actions,
  className,
}: AdminPageHeaderProps) {
  const locale = useLocale();
  const intlLocale = LOCALE_MAP[locale] ?? 'en-US';

  const today = new Date();
  const formattedDate = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(today);

  return (
    <div
      className={cn(
        'flex flex-col gap-5 md:flex-row md:items-center md:justify-between',
        className
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">
            {title}
          </h1>
          {tenantName && (
            <Badge
              variant="outline"
              className="text-xs font-mono border-blue-500/20 text-blue-500 bg-blue-500/10"
            >
              <Shield className="mr-1 h-3 w-3" />
              {tenantName}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground font-medium" suppressHydrationWarning>
          {formattedDate} • {subtitle}
        </p>
      </div>

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
