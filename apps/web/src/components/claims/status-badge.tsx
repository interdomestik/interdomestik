import { Badge } from '@interdomestik/ui';

// This component uses shared types but avoids tight coupling by accepting simple props
// where possible, or strictly typed domain props.

const STATUS_BADGE_STYLES: Record<string, string> = {
  submitted:
    'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/40',
  verification:
    'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/40',
  evaluation:
    'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/40',
  negotiation:
    'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/40',
  court:
    'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/40',
  resolved:
    'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/40',
  rejected:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800/40',
  draft:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800/40',
  other:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800/40',
};

interface StatusBadgeProps {
  label: string;
  status: string; // "submitted" | "verification" etc.
  testId?: string;
  className?: string;
}

export function StatusBadge({ label, status, testId, className }: StatusBadgeProps) {
  const styleKey = STATUS_BADGE_STYLES[status] ? status : 'other';
  const styles = STATUS_BADGE_STYLES[styleKey];

  return (
    <Badge
      variant="outline"
      className={`${styles} font-medium ${className || ''}`}
      data-testid={testId}
    >
      {label}
    </Badge>
  );
}
