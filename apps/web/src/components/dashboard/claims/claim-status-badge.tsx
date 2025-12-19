import { Badge } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';

const statusVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  submitted: 'secondary',
  verification: 'secondary',
  evaluation: 'default',
  processing: 'default',
  negotiation: 'default',
  court: 'default',
  resolved: 'default',
  rejected: 'destructive',
};

export function ClaimStatusBadge({ status }: { status: string | null }) {
  const t = useTranslations('claims.status');

  if (!status) return <Badge variant="outline">{t('unknown', { defaultValue: 'Unknown' })}</Badge>;

  const variant = statusVariants[status] || 'outline';

  return <Badge variant={variant}>{t(status)}</Badge>;
}
