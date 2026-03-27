import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { getRoleLabel } from '@/lib/roles-i18n';
import { getTranslations } from 'next-intl/server';
import { formatDate } from './utils';

export async function MembershipInfoCard({
  subscription,
  membershipStatus,
  membershipBadgeClass,
  isMembershipProfile,
  role,
}: {
  subscription: {
    planId: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  membershipStatus: string;
  membershipBadgeClass: string;
  isMembershipProfile: boolean;
  role: string;
}) {
  const t = await getTranslations('admin.member_profile');
  const tCommon = await getTranslations('common');

  let cancellationStatus = tCommon('none');
  if (subscription) {
    cancellationStatus = subscription.cancelAtPeriodEnd ? tCommon('yes') : tCommon('no');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {t(isMembershipProfile ? 'sections.membership' : 'sections.account')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            {t(isMembershipProfile ? 'labels.status' : 'labels.account_type')}
          </span>
          <Badge className={membershipBadgeClass} variant="outline">
            {t(`status.${isMembershipProfile ? membershipStatus : 'operator'}`)}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            {t(isMembershipProfile ? 'labels.plan' : 'labels.role_scope')}
          </span>
          <span className="font-medium text-foreground">
            {isMembershipProfile
              ? subscription?.planId || t('labels.not_set')
              : getRoleLabel(tCommon, role)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('labels.period_end')}</span>
          <span className="font-medium text-foreground">
            {isMembershipProfile
              ? formatDate(subscription?.currentPeriodEnd ?? null, tCommon('none'))
              : t('labels.not_applicable')}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('labels.cancel_at_period_end')}</span>
          <span className="font-medium text-foreground">
            {isMembershipProfile ? cancellationStatus : t('labels.not_applicable')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
