'use client';

import type { ClaimRecoveryDecisionDto } from '@/features/claims/tracking/types';
import { Link } from '@/i18n/routing';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';

type Props = Readonly<{
  decision: ClaimRecoveryDecisionDto;
  supportHref: string;
}>;

export function MemberRecoveryDecisionCard({ decision, supportHref }: Props) {
  const t = useTranslations('claims.detail.recoveryDecision');
  const reasonCode = decision.declineReasonCode ?? 'other';

  return (
    <Card data-testid="member-claim-recovery-decision">
      <CardHeader>
        <CardTitle>
          {decision.status === 'accepted' ? t('acceptedTitle') : t('declinedTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {decision.status === 'accepted' ? (
          <p className="text-sm text-muted-foreground">{t('acceptedDescription')}</p>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">{t(`reasons.${reasonCode}.title`)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`reasons.${reasonCode}.description`)}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {t('nextAction')}
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href={supportHref} data-testid="member-recovery-decision-support-link">
                  {t('supportCta')}
                </Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
