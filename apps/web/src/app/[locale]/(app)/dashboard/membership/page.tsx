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
import { AlertTriangle, CheckCircle, CreditCard, Shield, XCircle } from 'lucide-react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

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
        <h1 className="text-3xl font-bold tracking-tight">Membership</h1>
        <p className="text-muted-foreground">Manage your subscription and plan details.</p>
      </div>

      {/* DUNNING: Grace Period Warning Banner */}
      {isPastDue && isInGracePeriod && (
        <div className="rounded-lg border-2 border-orange-500 bg-orange-50 p-4 dark:bg-orange-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-200">
                Payment Failed - {daysRemaining} days remaining
              </h3>
              <p className="mt-2 text-orange-700 dark:text-orange-300">
                Your last payment was unsuccessful. Please update your payment method to avoid
                losing access to your membership benefits.
              </p>
              <p className="mt-2 text-sm text-orange-600">
                Grace period ends: {subscription?.gracePeriodEndsAt?.toLocaleDateString()}
              </p>
              <Button className="mt-4 bg-orange-600 hover:bg-orange-700">
                <CreditCard className="h-4 w-4 mr-2" />
                Update Payment Method
              </Button>
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
                Membership Suspended
              </h3>
              <p className="mt-2 text-red-700 dark:text-red-300">
                Your grace period has expired and your membership is now suspended. Please update
                your payment method to restore access.
              </p>
              <div className="mt-4 flex gap-2">
                <Button variant="default">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Update Payment Method
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/pricing">View Plans</Link>
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
              Current Plan
            </CardTitle>
            <CardDescription>Your protection tier</CardDescription>
          </CardHeader>
          <CardContent>
            {subscription &&
            (subscription.status === 'active' || subscription.status === 'trialing') ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-2xl font-bold text-primary">Active</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Plan: <span className="font-medium">{subscription.planId}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Status: <span className="capitalize font-medium">{subscription.status}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Renews:{' '}
                  {subscription.currentPeriodEnd
                    ? subscription.currentPeriodEnd.toLocaleDateString()
                    : 'N/A'}
                </p>
              </div>
            ) : isPastDue ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <span className="text-2xl font-bold text-orange-600">Payment Issue</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Plan: <span className="font-medium">{subscription?.planId}</span>
                </p>
                {isInGracePeriod && (
                  <p className="text-sm text-orange-600 font-medium">
                    ⏳ {daysRemaining} days to update payment
                  </p>
                )}
                {subscription?.dunningAttemptCount && subscription.dunningAttemptCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Payment attempts: {subscription.dunningAttemptCount}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground">No active membership</div>
            )}
          </CardContent>
          <CardFooter>
            {subscription ? (
              <Button variant="outline">Manage Subscription</Button>
            ) : (
              <Button asChild>
                <Link href="/pricing">View Plans</Link>
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Usage & Benefits Card */}
        <Card className={!subscription || isGraceExpired ? 'opacity-50' : ''}>
          <CardHeader>
            <CardTitle>Usage &amp; Benefits</CardTitle>
            <CardDescription>
              {subscription && !isGraceExpired
                ? 'Your membership benefits'
                : 'Join to access benefits'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subscription && !isGraceExpired ? (
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  24/7 Emergency Hotline
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Voice Claim Filing
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Legal Consultations
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Partner Discounts
                </li>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isGraceExpired
                  ? 'Update your payment to restore access to benefits.'
                  : 'Use the pricing page to activate your protection.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
