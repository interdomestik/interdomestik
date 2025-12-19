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
import { Activity, ArrowRight, FileText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function AgentDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('agent');
  const { stats, recentClaims } = await getAgentDashboardData();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('dashboard')} -{' '}
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Button asChild>
          <Link href="/agent/claims">
            {t('claims_queue')} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <AgentStatsCards stats={stats} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>{t('table.recent_activity', { defaultValue: 'Recent Activity' })}</CardTitle>
            <CardDescription>
              {recentClaims.length === 0
                ? t('table.no_claims')
                : 'Your most recently updated cases.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {recentClaims.map(claim => (
                <div key={claim.id} className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">{claim.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {claim.user?.name || 'Unknown User'} • {claim.companyName}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <ClaimStatusBadge status={claim.status} />
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/agent/claims/${claim.id}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
              {recentClaims.length === 0 && (
                <div className="py-10 text-center text-muted-foreground opacity-50">
                  <Activity className="h-10 w-10 mx-auto mb-3" />
                  <p>{t('table.no_claims')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>{t('details.notes', { defaultValue: 'Workspace Notes' })}</CardTitle>
            <CardDescription>Quick reminders and private workspace notes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm">
                <p className="font-semibold mb-1">{t('notes.priority')}</p>
                <p className="opacity-80">
                  All claims from Interdomestik Insurance need to be verified within 24 hours.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
                <p className="font-semibold mb-1">{t('notes.deadline')}</p>
                <p className="opacity-80">
                  End of quarter reporting starts on Monday. Ensure all resolved cases are
                  documented.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
