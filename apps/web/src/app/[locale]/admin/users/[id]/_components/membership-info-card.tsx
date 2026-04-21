import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { getRoleLabel } from '@/lib/roles-i18n';
import { getTranslations } from 'next-intl/server';
import { formatDate } from './utils';
import type { AdminTenantOption } from '@/components/admin/admin-tenant-selector';
import { TenantClassificationControls } from '@/features/admin/users/components/tenant-classification-controls';

export async function MembershipInfoCard({
  subscription,
  membershipStatus,
  membershipBadgeClass,
  isMembershipProfile,
  role,
  tenantClassificationPending = false,
  currentTenantId,
  canReassignTenant,
  tenantOptions,
  userId,
}: {
  subscription: {
    planId: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    gracePeriodEndsAt?: Date | null;
  } | null;
  membershipStatus: string;
  membershipBadgeClass: string;
  isMembershipProfile: boolean;
  role: string;
  tenantClassificationPending?: boolean;
  currentTenantId: string | null;
  canReassignTenant: boolean;
  tenantOptions: AdminTenantOption[];
  userId: string;
}) {
  const t = await getTranslations('admin.member_profile');
  const tCommon = await getTranslations('common');

  let cancellationStatus = tCommon('none');
  if (subscription) {
    cancellationStatus = subscription.cancelAtPeriodEnd ? tCommon('yes') : tCommon('no');
  }

  const lifecycleDetail =
    subscription && isMembershipProfile
      ? getLifecycleDetail({
          status: membershipStatus,
          periodEnd: subscription.currentPeriodEnd,
          gracePeriodEndsAt: subscription.gracePeriodEndsAt ?? null,
          fallback: tCommon('none'),
          formatMessage: (key, date) => t(`status_context.${key}`, { date }),
        })
      : null;

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
          <div className="flex flex-col items-end gap-1 text-right">
            <Badge
              className={membershipBadgeClass}
              variant="outline"
              data-testid="membership-lifecycle-status"
              data-lifecycle-status={isMembershipProfile ? membershipStatus : 'operator'}
              title={lifecycleDetail ?? undefined}
            >
              {t(`status.${isMembershipProfile ? membershipStatus : 'operator'}`)}
            </Badge>
            {lifecycleDetail ? (
              <span
                className="max-w-[12rem] text-xs text-muted-foreground"
                data-testid="membership-lifecycle-status-detail"
              >
                {lifecycleDetail}
              </span>
            ) : null}
          </div>
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
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('labels.tenant_review')}</span>
          <span className="font-medium text-foreground">
            {tenantClassificationPending
              ? t('labels.tenant_review_pending')
              : t('labels.tenant_review_confirmed')}
          </span>
        </div>
        {currentTenantId ? (
          <TenantClassificationControls
            userId={userId}
            currentTenantId={currentTenantId}
            tenantClassificationPending={tenantClassificationPending}
            canReassignTenant={canReassignTenant}
            tenantOptions={tenantOptions}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function getLifecycleDetail(args: {
  status: string;
  periodEnd: Date | null;
  gracePeriodEndsAt: Date | null;
  fallback: string;
  formatMessage: (key: 'active_in_grace' | 'scheduled_cancel', date: string) => string;
}): string | null {
  if (args.status === 'active_in_grace') {
    return args.formatMessage('active_in_grace', formatDate(args.gracePeriodEndsAt, args.fallback));
  }

  if (args.status === 'scheduled_cancel') {
    return args.formatMessage('scheduled_cancel', formatDate(args.periodEnd, args.fallback));
  }

  return null;
}
