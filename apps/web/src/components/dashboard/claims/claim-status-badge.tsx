import { getClaimStatusBadgeVariant } from '@/lib/claim-ui';
import { Badge } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';

export function ClaimStatusBadge({ status }: { status: string | null }) {
  const t = useTranslations('claims.status');

  if (!status) return <Badge variant="outline">{t('unknown', { defaultValue: 'Unknown' })}</Badge>;

  const variant = getClaimStatusBadgeVariant(status);

  return <Badge variant={variant}>{t(status)}</Badge>;
}
