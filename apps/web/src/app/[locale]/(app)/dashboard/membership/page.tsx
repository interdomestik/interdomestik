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
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Membership</h1>
        <p className="text-muted-foreground">Manage your subscription and plan details.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>Your active protection tier</CardDescription>
          </CardHeader>
          <CardContent>
            {subscription &&
            (subscription.status === 'active' || subscription.status === 'trialing') ? (
              <div className="space-y-2">
                <div className="text-2xl font-bold text-primary capitalize">
                  {subscription.planId}
                </div>
                <p className="text-sm text-muted-foreground">
                  Status: <span className="capitalize">{subscription.status}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Renews:{' '}
                  {subscription.currentPeriodEnd
                    ? subscription.currentPeriodEnd.toLocaleDateString()
                    : 'N/A'}
                </p>
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

        {/* Placeholder for Plan Benefits used */}
        <Card className="opacity-50">
          <CardHeader>
            <CardTitle>Usage & Benefits</CardTitle>
            <CardDescription>Join to access benefits</CardDescription>
          </CardHeader>
          <CardContent>Use the pricing page to activate your protection.</CardContent>
        </Card>
      </div>
    </div>
  );
}
