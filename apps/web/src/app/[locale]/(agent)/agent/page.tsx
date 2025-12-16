import { claims, db } from '@interdomestik/database';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { count, eq, sql } from 'drizzle-orm';
import { Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export default async function AgentDashboardPage() {
  // Fetch stats (MVP: minimal optimization)
  const [totalClaims] = await db.select({ count: count() }).from(claims);
  const [submittedClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.status, 'submitted'));
  const [verificationClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.status, 'verification'));
  const [resolvedClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(sql`${claims.status} = 'resolved' OR ${claims.status} = 'rejected'`);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Workspace</h1>
        <p className="text-muted-foreground">Welcome back. Here is the current claim overview.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClaims.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New (Submitted)</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{submittedClaims.count}</div>
            <p className="text-xs text-muted-foreground">Requires triage</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Verification</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{verificationClaims.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resolvedClaims.count}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity or list could go here */}
      <div className="rounded-md border p-8 text-center text-muted-foreground bg-muted/20">
        Claim List Component Coming Soon
      </div>
    </div>
  );
}
