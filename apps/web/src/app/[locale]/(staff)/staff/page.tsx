import { getAgentDashboardData } from '@/actions/agent-dashboard';
import { AgentStatsCards } from '@/components/agent/agent-stats-cards';
import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
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

export default async function StaffDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const tNav = await getTranslations('nav');
  const tCommon = await getTranslations('common');
  const tClaims = await getTranslations('agent-claims.claims');

  const { stats, recentClaims } = await getAgentDashboardData();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
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
                  <ClaimStatusBadge status={claim.status} />
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
