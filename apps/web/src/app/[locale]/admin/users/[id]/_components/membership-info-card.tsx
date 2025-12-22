import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { getTranslations } from 'next-intl/server';
import { formatDate } from './utils';

export async function MembershipInfoCard({
  subscription,
  membershipStatus,
  membershipBadgeClass,
}: {
  subscription: any;
  membershipStatus: string;
  membershipBadgeClass: string;
}) {
  const t = await getTranslations('admin.member_profile');
  const tCommon = await getTranslations('common');

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
          <span className="font-medium text-foreground">
            {subscription
              ? subscription.cancelAtPeriodEnd
                ? tCommon('yes')
                : tCommon('no')
              : tCommon('none')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
