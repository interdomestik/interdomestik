'use client';

import { Badge } from '@interdomestik/ui/components/badge';
import { cn } from '@interdomestik/ui/lib/utils';
import { Shield } from 'lucide-react';
import { useLocale } from 'next-intl';
import { formatPilotDate } from '@/lib/utils/date';
import { ReactNode, useSyncExternalStore } from 'react';

const subscribeToNothing = (): (() => void) => () => undefined;

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string | ReactNode;
  tenantName?: string;
  actions?: ReactNode;
  className?: string;
  headingId?: string;
}

export function AdminPageHeader({
  title,
  subtitle,
  tenantName,
  actions,
  className,
  headingId,
}: AdminPageHeaderProps) {
  const locale = useLocale();
  // Read the clock only on the client: server and client renders may straddle midnight.
  const formattedDate = useSyncExternalStore(
    subscribeToNothing,
    () => formatPilotDate(new Date(), locale, ''),
    () => ''
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-5 md:flex-row md:items-center md:justify-between',
        className
      )}
    >
      <div className="space-y-0.5">
        <div className="flex items-center gap-3">
          <h1 id={headingId} className="text-2xl font-semibold tracking-tight text-slate-900">
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
        <p className="text-muted-foreground font-medium">
          {formattedDate ? `${formattedDate} • ` : ''}
          {subtitle}
        </p>
      </div>

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
