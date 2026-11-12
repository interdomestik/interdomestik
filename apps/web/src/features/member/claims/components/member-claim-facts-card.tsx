import { formatClaimAmount } from '@/lib/utils/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import type { MemberClaimDetailOpsClaim } from './member-claim-detail-types';

export function MemberClaimFactsCard({
  claim,
}: Readonly<{
  claim: Pick<MemberClaimDetailOpsClaim, 'description' | 'amount' | 'currency'>;
}>): React.JSX.Element {
  const t = useTranslations('claims');
  const locale = useLocale();
  return (
    <Card data-testid="member-claim-case-details">
      <CardHeader>
        <CardTitle>{t('detail.caseDetails')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm">{claim.description}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <span className="text-xs text-muted-foreground uppercase">{t('table.amount')}</span>
            <p className="font-medium break-words">
              {formatClaimAmount(claim.amount, claim.currency, locale) ?? '—'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
