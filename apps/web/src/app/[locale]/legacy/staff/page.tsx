import { AgentStatsCards } from '@/components/agent/agent-stats-cards';
import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import { getCanonicalRouteForRole } from '@/lib/canonical-routes';
import { db } from '@/lib/db.server';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { ArrowRight, FileText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getStaffDashboardCore } from '@/app/[locale]/(staff)/staff/_core';

async function getAuth() {
  try {
    const { auth } = await import('@/lib/auth');
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
}

export default async function LegacyStaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getAuth();
  if (!session) redirect(`/${locale}/login`);

  const canonical = getCanonicalRouteForRole('staff', locale);
  const linkHref = canonical?.startsWith(`/${locale}/`)
    ? canonical.replace(`/${locale}`, '')
    : canonical;
  const result = await getStaffDashboardCore({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    role: session.user.role,
    db,
  });

  if (!result.ok) {
    if (result.code === 'FORBIDDEN') return notFound();
    throw new Error('Internal Server Error');
  }

  const { stats, recentClaims } = result.data;

  const tNav = await getTranslations('nav');
  const tCommon = await getTranslations('common');
  const tClaims = await getTranslations('agent-claims.claims');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {linkHref ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          data-testid="legacy-banner"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>You are viewing a legacy dashboard. Go to the v3 dashboard.</span>
            <Link
              href={linkHref}
              className="rounded-full bg-amber-900 px-3 py-1 text-xs font-semibold text-white"
              data-testid="legacy-banner-link"
            >
              Go to v3 dashboard
            </Link>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{tNav('overview')}</h1>
          <p className="text-muted-foreground">
            {tCommon('roles.staff')} —{' '}
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Button asChild>
          <Link href="/staff/claims">
            {tClaims('claims_queue')} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <AgentStatsCards stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {tClaims('table.recent_activity')}
          </CardTitle>
          <CardDescription>{tClaims('manage_triage')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentClaims.map(claim => (
              <div key={claim.id} className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{claim.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {claim.user?.name || 'Unknown'} • {claim.companyName}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <ClaimStatusBadge
                    status={claim.status as import('@interdomestik/database/constants').ClaimStatus}
                  />
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/staff/claims/${claim.id}`}>{tCommon('view')}</Link>
                  </Button>
                </div>
              </div>
            ))}
            {recentClaims.length === 0 && (
              <div className="py-10 text-center text-muted-foreground opacity-70">
                <p>{tClaims('table.no_claims')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
