'use client';

import { format } from 'date-fns';
import { enUS, mk, sq, sr } from 'date-fns/locale';
import { Badge } from '@interdomestik/ui/components/badge';
import { cn } from '@interdomestik/ui/lib/utils';
import { Shield } from 'lucide-react';
import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string | ReactNode;
  tenantName?: string;
  actions?: ReactNode;
  className?: string;
}

const LOCALE_MAP = {
  en: enUS,
  sq,
  mk,
  sr,
};

function resolveRouteLocale(pathname: string | null, fallbackLocale: string): string {
  const routeLocale = pathname?.split('/')[1];
  if (routeLocale && routeLocale in LOCALE_MAP) {
    return routeLocale;
  }

  return fallbackLocale;
}

export function AdminPageHeader({
  title,
  subtitle,
  tenantName,
  actions,
  className,
}: AdminPageHeaderProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const dateLocale =
    LOCALE_MAP[resolveRouteLocale(pathname, locale) as keyof typeof LOCALE_MAP] ?? enUS;

  const today = new Date();
  const formattedDate = format(today, 'EEEE, MMMM d, yyyy', { locale: dateLocale });

  return (
    <div
      className={cn(
        'flex flex-col gap-5 md:flex-row md:items-center md:justify-between',
        className
      )}
    >
      <div className="space-y-0.5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
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
