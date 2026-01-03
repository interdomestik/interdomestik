import {
  getAdminDashboardStats,
  getRecentClaims,
  getUnassignedClaims,
} from '@/actions/admin-dashboard';
import { AnalyticsDashboard } from '@/components/admin/analytics-dashboard';
import { AdminStatsCards } from '@/components/admin/dashboard/admin-stats-cards';
import { RecentActivityCard } from '@/components/admin/dashboard/recent-activity-card';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { Plus, UserPlus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { Suspense } from 'react';

export default async function AdminDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('agent');
  const tAdmin = await getTranslations('admin.dashboard');

  const adminContextParams = new URLSearchParams();
  for (const [key, value] of Object.entries(sp ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        adminContextParams.append(key, item);
      }
    } else {
      adminContextParams.set(key, value);
    }
  }
  const adminContextQueryString = adminContextParams.toString();

  const withAdminContext = (href: string) => {
    if (!adminContextQueryString) return href;

    const [path, queryString] = href.split('?');
    const merged = new URLSearchParams(adminContextQueryString);
    if (queryString) {
      const destinationParams = new URLSearchParams(queryString);
      const destinationKeys = new Set(Array.from(destinationParams.keys()));
      for (const key of destinationKeys) {
        merged.delete(key);
        for (const value of destinationParams.getAll(key)) {
          merged.append(key, value);
        }
      }
    }

    const next = merged.toString();
    return next ? `${path}?${next}` : path;
  };

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const tenantId = ensureTenantId(session);

  const [stats, recentClaims, unassignedClaims] = await Promise.all([
    getAdminDashboardStats(tenantId),
    getRecentClaims(tenantId, 5),
    getUnassignedClaims(tenantId, 5),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{tAdmin('title')}</h1>
          <p className="text-muted-foreground">
            {t('title')} - {new Date().toLocaleDateString(locale)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={withAdminContext('/admin/agents')}>
              <UserPlus className="mr-2 h-4 w-4" />
              {tAdmin('invite_agent')}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={withAdminContext('/admin/users')}>
              <Plus className="mr-2 h-4 w-4" />
              {tAdmin('create_user')}
            </Link>
          </Button>
        </div>
      </div>

      <AnalyticsDashboard />

      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 h-24 animate-pulse bg-muted rounded-lg" />
        }
      >
        <AdminStatsCards stats={stats} />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Suspense fallback={<Card className="col-span-4 h-96 animate-pulse" />}>
          <RecentActivityCard claims={recentClaims} queryString={adminContextQueryString} />
        </Suspense>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle as="h2">{tAdmin('unassigned_claims')}</CardTitle>
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
                    <Link href={withAdminContext(`/admin/claims/${claim.id}`)}>
                      {tAdmin('assign')}
                    </Link>
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
