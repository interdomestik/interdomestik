import { auth } from '@/lib/auth';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { GracePeriodBanner } from './components/grace-period-banner';
import { LockedStateBanner } from './components/locked-state-banner';
import { ManageSubscriptionButton } from './components/manage-subscription-button';

import { getMembershipPageModelCore } from './_core';

export default async function MembershipPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const t = await getTranslations('membership');

  const { subscription, dunning } = await getMembershipPageModelCore({
    userId: session.user.id,
  });

  const { isPastDue, isInGracePeriod, isGraceExpired, daysRemaining } = dunning;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('page.title')}</h1>
        <p className="text-muted-foreground">{t('page.description')}</p>
      </div>

      {/* DUNNING: Grace Period Warning Banner */}
      {subscription && isPastDue && isInGracePeriod && (
        <GracePeriodBanner
          daysRemaining={daysRemaining}
          gracePeriodEndsAt={subscription.gracePeriodEndsAt}
          subscriptionId={subscription.id}
          t={t}
        />
      )}

      {/* DUNNING: Locked State - Grace Period Expired */}
      {subscription && isGraceExpired && (
        <LockedStateBanner subscriptionId={subscription.id} t={t} />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <PlanStatusCard
          subscription={subscription}
          dunning={dunning}
          t={t}
          isGraceExpired={isGraceExpired}
        />

        <BenefitsCard subscription={subscription} isGraceExpired={isGraceExpired} t={t} />
      </div>
    </div>
  );
}

function PlanStatusCard({ subscription, dunning, t, isGraceExpired }: any) {
  const { isPastDue, isInGracePeriod, daysRemaining } = dunning;
  const isActive =
    subscription && (subscription.status === 'active' || subscription.status === 'trialing');

  const renderContent = () => {
    if (isActive) {
      return (
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
      );
    }
    if (isPastDue) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <span className="text-2xl font-bold text-orange-600">{t('dunning.payment_issue')}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('plan.plan_label')}: <span className="font-medium">{subscription?.planId}</span>
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
      );
    }
    return <div className="text-muted-foreground">{t('plan.no_membership')}</div>;
  };

  return (
    <Card className={isGraceExpired ? 'opacity-60' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t('plan.title')}
        </CardTitle>
        <CardDescription>{t('plan.description')}</CardDescription>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
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
  );
}

function BenefitsCard({ subscription, isGraceExpired, t }: any) {
  return (
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
  );
}
