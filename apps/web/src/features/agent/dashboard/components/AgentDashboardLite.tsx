import { Link } from '@/i18n/routing';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { ArrowRight, ClipboardList, TrendingUp, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface AgentDashboardLiteProps {
  newLeadsCount: number;
  activeClaimsCount: number;
  followUpsCount: number;
  locale: string;
}

export async function AgentDashboardLite({
  newLeadsCount,
  activeClaimsCount,
  followUpsCount,
  locale,
}: AgentDashboardLiteProps) {
  const t = await getTranslations('agent');

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="agent-home">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Link
          href="/agent/workspace"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed hover:bg-slate-100 text-slate-900 h-10 px-4 py-2 gap-2 text-muted-foreground hover:text-foreground"
          data-testid="agent-switch-pro"
        >
          Pro Workspace <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* My New Leads */}
        <Link
          href="/agent/leads?status=new"
          className="block transition-transform hover:scale-[1.02]"
        >
          <Card
            className="h-full border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md"
            data-testid="agent-tile-new-leads"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">My New Leads</CardTitle>
              <Users className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2">{newLeadsCount}</div>
              <p className="text-sm text-muted-foreground flex items-center">
                Review and contact <ArrowRight className="ml-1 h-3 w-3" />
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* My Follow-ups */}
        <div className="block opacity-80">
          <Card
            className="h-full border-l-4 border-l-orange-500 bg-muted/20"
            data-testid="agent-tile-followups"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">My Follow-ups</CardTitle>
              <TrendingUp className="h-5 w-5 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2">{followUpsCount}</div>
              <p className="text-sm text-muted-foreground">Coming soon</p>
            </CardContent>
          </Card>
        </div>

        {/* My Active Claims */}
        <div className="block opacity-80">
          <Card
            className="h-full border-l-4 border-l-green-500 bg-muted/20"
            data-testid="agent-tile-active-claims"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">My Active Claims</CardTitle>
              <ClipboardList className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2">{activeClaimsCount}</div>
              <p className="text-sm text-muted-foreground">Coming soon</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
