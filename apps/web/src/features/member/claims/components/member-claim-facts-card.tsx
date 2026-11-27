import { formatClaimAmount } from '@/lib/utils/currency';
import { useLocale, useTranslations } from 'next-intl';
import type { MemberClaimDetailOpsClaim } from './member-claim-detail-types';
import {
  DETAIL_CARD,
  DETAIL_DIVIDER,
  DETAIL_HEADING,
  DETAIL_TERM,
} from './member-claim-detail-styles';

export function MemberClaimFactsCard({
  claim,
}: Readonly<{
  claim: Pick<MemberClaimDetailOpsClaim, 'description' | 'amount' | 'currency'>;
}>): React.JSX.Element {
  const t = useTranslations('claims');
  const locale = useLocale();
  const amount = formatClaimAmount(claim.amount, claim.currency, locale);
  return (
    <div className={`${DETAIL_CARD} space-y-4`} data-testid="member-claim-case-details">
      <h2 className={DETAIL_HEADING}>{t('detail.caseDetails')}</h2>
      <p className="whitespace-pre-line text-sm leading-6">{claim.description}</p>
      {amount ? (
        <dl className={`${DETAIL_DIVIDER} grid gap-4 text-sm sm:grid-cols-2`}>
          <div className="min-w-0 space-y-1">
            <dt className={DETAIL_TERM}>{t('table.amount')}</dt>
            <dd className="font-semibold break-words">{amount}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
