import { auth } from '@/lib/auth';
import { db, eq, subscriptions } from '@interdomestik/database';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { AlertTriangle, CheckCircle, Shield, XCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ManageSubscriptionButton } from './components/manage-subscription-button';
import { UpdatePaymentButton } from './components/update-payment-button';

// Helper to calculate days remaining in grace period
function getDaysRemaining(endDate: Date | null): number {
  if (!endDate) return 0;
  const now = new Date();
  const diff = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// Helper to check if grace period has expired
function isGracePeriodExpired(endDate: Date | null): boolean {
  if (!endDate) return false;
  return new Date() > endDate;
}

export default async function MembershipPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const t = await getTranslations('membership');

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, session.user.id),
  });

  const isPastDue = subscription?.status === 'past_due';
  const isInGracePeriod =
    isPastDue &&
    subscription?.gracePeriodEndsAt &&
    !isGracePeriodExpired(subscription.gracePeriodEndsAt);
  const daysRemaining = getDaysRemaining(subscription?.gracePeriodEndsAt || null);
  const isGraceExpired = isPastDue && isGracePeriodExpired(subscription?.gracePeriodEndsAt || null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('page.title')}</h1>
        <p className="text-muted-foreground">{t('page.description')}</p>
      </div>

      {/* DUNNING: Grace Period Warning Banner */}
      {isPastDue && isInGracePeriod && (
        <div className="rounded-lg border-2 border-orange-500 bg-orange-50 p-4 dark:bg-orange-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-200">
                {t('dunning.payment_failed_title', { daysRemaining })}
              </h3>
              <p className="mt-2 text-orange-700 dark:text-orange-300">
                {t('dunning.payment_failed_message')}
              </p>
              <p className="mt-2 text-sm text-orange-600">
                {t('dunning.grace_period_ends', {
                  date: subscription?.gracePeriodEndsAt?.toLocaleDateString() || '',
                })}
              </p>
              <UpdatePaymentButton
                subscriptionId={subscription.id}
                label={t('dunning.update_payment_button')}
                className="mt-4 bg-orange-600 hover:bg-orange-700"
              />
            </div>
          </div>
        </div>
      )}

      {/* DUNNING: Locked State - Grace Period Expired */}
      {isGraceExpired && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
                {t('dunning.suspended_title')}
              </h3>
              <p className="mt-2 text-red-700 dark:text-red-300">
                {t('dunning.suspended_message')}
              </p>
              <div className="mt-4 flex gap-2">
                <UpdatePaymentButton
                  subscriptionId={subscription.id}
                  label={t('dunning.update_payment_button')}
                />
                <Button variant="outline" asChild>
                  <Link href="/pricing">{t('plan.view_plans_button')}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className={isGraceExpired ? 'opacity-60' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t('plan.title')}
            </CardTitle>
            <CardDescription>{t('plan.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {subscription &&
            (subscription.status === 'active' || subscription.status === 'trialing') ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-2xl font-bold text-primary">{t('plan.active')}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('plan.plan_label')}: <span className="font-medium">{subscription.planId}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('plan.status_label')}:{' '}
                  <span className="capitalize font-medium">{subscription.status}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('plan.renews_label')}:{' '}
                  {subscription.currentPeriodEnd
                    ? subscription.currentPeriodEnd.toLocaleDateString()
                    : t('plan.na')}
                </p>
              </div>
            ) : isPastDue ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <span className="text-2xl font-bold text-orange-600">
                    {t('dunning.payment_issue')}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('plan.plan_label')}:{' '}
                  <span className="font-medium">{subscription?.planId}</span>
                </p>
                {isInGracePeriod && (
                  <p className="text-sm text-orange-600 font-medium">
                    {t('dunning.days_to_update', { daysRemaining })}
                  </p>
                )}
                {subscription?.dunningAttemptCount && subscription.dunningAttemptCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('dunning.payment_attempts', { count: subscription.dunningAttemptCount })}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground">{t('plan.no_membership')}</div>
            )}
          </CardContent>
          <CardFooter>
            {subscription ? (
              <ManageSubscriptionButton
                subscriptionId={subscription.id}
                labels={{
                  manage: t('plan.manage_button'),
                  updatePayment: t('dunning.update_payment_button'),
                  cancel: t('plan.cancel_button'),
                  cancelConfirm: t('plan.cancel_confirm'),
                }}
              />
            ) : (
              <Button asChild>
                <Link href="/pricing">{t('plan.view_plans_button')}</Link>
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Usage & Benefits Card */}
        <Card className={!subscription || isGraceExpired ? 'opacity-50' : ''}>
          <CardHeader>
            <CardTitle>{t('benefits.title')}</CardTitle>
            <CardDescription>
              {subscription && !isGraceExpired
                ? t('benefits.description_active')
                : t('benefits.description_inactive')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subscription && !isGraceExpired ? (
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  {t('benefits.hotline')}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  {t('benefits.voice_claim')}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  {t('benefits.legal')}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  {t('benefits.discounts')}
                </li>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isGraceExpired ? t('benefits.restore_message') : t('benefits.activate_message')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
