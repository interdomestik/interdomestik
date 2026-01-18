'use client';

import { Badge } from '@interdomestik/ui';

interface OpsStatusBadgeProps {
  label: string;
  variant?: 'neutral' | 'info' | 'warning' | 'success' | 'danger';
  className?: string;
}

const VARIANTS: Record<NonNullable<OpsStatusBadgeProps['variant']>, string> = {
  neutral: 'bg-muted text-muted-foreground border-muted',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  warning: 'bg-orange-100 text-orange-700 border-orange-200',
  success: 'bg-green-100 text-green-700 border-green-200',
  danger: 'bg-red-100 text-red-700 border-red-200',
};

export function OpsStatusBadge({ label, variant = 'neutral', className }: OpsStatusBadgeProps) {
  const classes = [VARIANTS[variant], className].filter(Boolean).join(' ');
  return <Badge className={classes}>{label}</Badge>;
}
