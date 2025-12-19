import { db } from '@interdomestik/database/db';
import { claims, user } from '@interdomestik/database/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { count, eq } from 'drizzle-orm';
import { AlertCircle, CheckCircle, FileText, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface DashboardStatsProps {
  totalClaims: number;
  newClaims: number;
  resolvedClaims: number;
  totalUsers: number;
}

async function getStats(): Promise<DashboardStatsProps> {
  const [totalClaimsRes] = await db.select({ count: count() }).from(claims);
  const [newClaimsRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.status, 'submitted'));
  const [resolvedClaimsRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.status, 'resolved'));
  const [totalUsersRes] = await db
    .select({ count: count() })
    .from(user)
    .where(eq(user.role, 'user'));

  return {
    totalClaims: totalClaimsRes.count,
    newClaims: newClaimsRes.count,
    resolvedClaims: resolvedClaimsRes.count,
    totalUsers: totalUsersRes.count,
  };
}

export default async function AdminDashboardPage() {
  const t = await getTranslations('agent');
  const stats = await getStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('dashboard')}</h1>
        <p className="text-muted-foreground">
          {t('title')} - {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.total')}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClaims}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.new')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.newClaims}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.closed')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.resolvedClaims}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Members</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
          </CardContent>
        </Card>
      </div>

      {/* Placeholder for Inbox / Recent Activity */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
        <h3 className="font-semibold leading-none tracking-tight mb-4">
          Urgent Attention Required (Mock)
        </h3>
        <div className="text-muted-foreground text-sm">No urgent claims assigned to you yet.</div>
      </div>
    </div>
  );
}
