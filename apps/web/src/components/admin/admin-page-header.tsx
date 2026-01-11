import { Badge } from '@interdomestik/ui/components/badge';
import { cn } from '@interdomestik/ui/lib/utils';
import { Shield } from 'lucide-react';
import { ReactNode } from 'react';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string | ReactNode;
  tenantName?: string;
  actions?: ReactNode;
  className?: string;
}

export function AdminPageHeader({
  title,
  subtitle,
  tenantName,
  actions,
  className,
}: AdminPageHeaderProps) {
  const today = new Date();
  const formattedDate = new Intl.DateTimeFormat('mk-MK', {
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
        <p className="text-muted-foreground font-medium">
          {formattedDate} • {subtitle}
        </p>
      </div>

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
