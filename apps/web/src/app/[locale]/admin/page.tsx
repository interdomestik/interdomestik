import {
  getAdminDashboardStats,
  getRecentClaims,
  getUnassignedClaims,
} from '@/actions/admin-dashboard';
import { AdminStatsCards } from '@/components/admin/dashboard/admin-stats-cards';
import { RecentActivityCard } from '@/components/admin/dashboard/recent-activity-card';
import { Link } from '@/i18n/routing';
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
import { Suspense } from 'react';

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('agent');
  const tAdmin = await getTranslations('admin.dashboard');

  const [stats, recentClaims, unassignedClaims] = await Promise.all([
    getAdminDashboardStats(),
    getRecentClaims(5),
    getUnassignedClaims(5),
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

      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 h-24 animate-pulse bg-muted rounded-lg" />
        }
      >
        <AdminStatsCards stats={stats} />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Suspense fallback={<Card className="col-span-4 h-96 animate-pulse" />}>
          <RecentActivityCard claims={recentClaims} />
        </Suspense>

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
                    <Link href={`/admin/claims/${claim.id}`}>{tAdmin('assign')}</Link>
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
