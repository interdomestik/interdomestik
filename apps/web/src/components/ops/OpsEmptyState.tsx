'use client';

import { PackageOpen } from 'lucide-react';
import { ReactNode } from 'react';

interface OpsEmptyStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  testId?: string;
}

export function OpsEmptyState({
  icon = <PackageOpen className="w-10 h-10 text-muted-foreground/40" />,
  title,
  subtitle,
  action,
  className,
  testId,
}: OpsEmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center py-12 px-4 text-center space-y-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted/30">
        {icon}
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-lg">{title}</h3>
        {subtitle && (
          <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">{subtitle}</p>
        )}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
