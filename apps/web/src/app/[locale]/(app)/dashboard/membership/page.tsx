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
import { getTranslations } from 'next-intl/server';
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

  const t = await getTranslations('pricing');

  // Placeholder for real subscription check
  const subscription = null;

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
            {subscription ? (
              <div className="text-2xl font-bold text-primary">Standard</div>
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
