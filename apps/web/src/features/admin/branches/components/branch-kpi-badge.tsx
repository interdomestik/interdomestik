import { Badge } from '@interdomestik/ui/components/badge';
import { cn } from '@interdomestik/ui/lib/utils';
import { AlertCircle, Banknote, FileText } from 'lucide-react';

interface BranchKpiBadgeProps {
  type: 'openClaims' | 'cashPending' | 'slaBreaches';
  count: number;
}

export function BranchKpiBadge({ type, count }: BranchKpiBadgeProps) {
  if (count === 0 && type !== 'openClaims') return null; // Hide zero counts except openClaims maybe? Or just grey them out.
  // Requirement: "Show ... operational KPIs"

  const config = {
    openClaims: {
      icon: FileText,
      colorClass: 'border-blue-500/20 bg-blue-500/10 text-blue-500',
      labelKey: 'table_open_claims', // Used for rendering via direct translation mapping in parent or here
    },
    cashPending: {
      icon: Banknote,
      colorClass: 'border-orange-500/20 bg-orange-500/10 text-orange-500',
      labelKey: 'table_cash_pending',
    },
    slaBreaches: {
      icon: AlertCircle,
      colorClass: 'border-red-500/20 bg-red-500/10 text-red-500',
      labelKey: 'table_sla_breaches',
    },
  };

  const { icon: Icon, colorClass } = config[type];
  const isZero = count === 0;

  return (
    <div className="flex items-center gap-2" title={type}>
      <Icon
        className={cn('h-4 w-4', isZero ? 'text-muted-foreground/50' : colorClass.split(' ').pop())}
      />
      <Badge
        variant="outline"
        className={cn(
          'font-mono h-5 min-w-[1.5rem] justify-center px-1',
          isZero ? 'text-muted-foreground border-white/10' : colorClass
        )}
      >
        {count}
      </Badge>
    </div>
  );
}
