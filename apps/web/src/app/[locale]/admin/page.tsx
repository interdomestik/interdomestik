import { Link } from '@/i18n/routing';
import { db } from '@interdomestik/database/db';
import { claims, user } from '@interdomestik/database/schema';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { count, desc, eq, isNull } from 'drizzle-orm';
import { AlertCircle, CheckCircle, FileText, Plus, UserPlus, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

async function getDashboardData() {
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

  const recentClaims = await db.query.claims.findMany({
    with: {
      user: true,
    },
    limit: 5,
    orderBy: [desc(claims.createdAt)],
  });

  const unassignedClaims = await db.query.claims.findMany({
    with: {
      user: true,
    },
    where: isNull(claims.agentId),
    limit: 5,
    orderBy: [desc(claims.createdAt)],
  });

  return {
    stats: {
      totalClaims: totalClaimsRes.count,
      newClaims: newClaimsRes.count,
      resolvedClaims: resolvedClaimsRes.count,
      totalUsers: totalUsersRes.count,
    },
    recentClaims,
    unassignedClaims,
  };
}

export default async function AdminDashboardPage() {
  const t = await getTranslations('agent');
  const tAdmin = await getTranslations('admin.dashboard');
  const tClaims = await getTranslations('claims.status');
  const { stats, recentClaims, unassignedClaims } = await getDashboardData();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{tAdmin('title')}</h1>
          <p className="text-muted-foreground">
            {t('title')} - {new Date().toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/users">
              <UserPlus className="mr-2 h-4 w-4" />
              {tAdmin('invite_agent')}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/users">
              <Plus className="mr-2 h-4 w-4" />
              {tAdmin('create_user')}
            </Link>
          </Button>
        </div>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{tAdmin('recent_activity')}</CardTitle>
              <CardDescription>
                {recentClaims.length === 0 ? tAdmin('no_recent_activity') : ''}
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/claims">{tAdmin('view_all')}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentClaims.map(claim => (
                <div
                  key={claim.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{claim.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {claim.user?.name || 'Unknown User'} • {claim.companyName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={claim.status === 'resolved' ? 'default' : 'secondary'}>
                      {tClaims(claim.status || 'draft')}
                    </Badge>
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/admin/claims/${claim.id}`}>
                        <FileText className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>{tAdmin('unassigned_claims')}</CardTitle>
            <CardDescription>
              {unassignedClaims.length === 0 ? tAdmin('no_unassigned_claims') : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {unassignedClaims.map(claim => (
                <div
                  key={claim.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{claim.title}</p>
                    <p className="text-sm text-muted-foreground">{claim.user?.name || 'Unknown'}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/claims/${claim.id}`}>Assign</Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
