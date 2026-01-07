import { formatDate } from '@/lib/utils/date';
import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';

import { AgentClientMembership, SubscriptionRecord } from '../_core';

interface MembershipCardProps {
  readonly subscription: SubscriptionRecord | null;
  readonly membership: AgentClientMembership;
  readonly t: (key: string) => string;
  readonly tCommon: (key: string) => string;
}

export function MembershipCard({ subscription, membership, t, tCommon }: MembershipCardProps) {
  const { status: membershipStatus, badgeClass: membershipBadgeClass } = membership;

  const getCancelAtPeriodEndLabel = (): string => {
    if (!subscription) return tCommon('none');
    return subscription.cancelAtPeriodEnd ? tCommon('yes') : tCommon('no');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('sections.membership')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('labels.status')}</span>
          <Badge className={membershipBadgeClass} variant="outline">
            {t(`status.${membershipStatus}`)}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('labels.plan')}</span>
          <span className="font-medium text-foreground">
            {subscription?.planId || t('labels.not_set')}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('labels.period_end')}</span>
          <span className="font-medium text-foreground">
            {formatDate(subscription?.currentPeriodEnd ?? null, tCommon('none'))}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('labels.cancel_at_period_end')}</span>
          <span className="font-medium text-foreground">{getCancelAtPeriodEndLabel()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
