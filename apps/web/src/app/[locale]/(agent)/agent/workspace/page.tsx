import { auth } from '@/lib/auth';
import { requireAgentPro } from '@/lib/agent-tier';
import { Link } from '@/i18n/routing';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { ArrowLeft, BarChart3, FileText, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AgentWorkspacePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const { isPro } = await requireAgentPro(session);
  if (!isPro) {
    const t = await getTranslations('agent-members.members.pro_required');
    return (
      <div className="space-y-4" data-testid="agent-pro-required">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/agent">{t('cta')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-8" data-testid="agent-pro-shell">
      {/* Header with Switch to Lite */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Pro Workspace</h1>
          <p className="text-muted-foreground mt-2">Advanced tools and controls for power users.</p>
        </div>
        <Link
          href="/agent"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed border border-[hsl(var(--border))] bg-transparent text-slate-900 hover:bg-slate-100 h-10 px-4 py-2 gap-2"
          data-testid="agent-switch-lite"
        >
          <ArrowLeft className="h-4 w-4" />
          Switch to Lite
        </Link>
      </div>

      {/* Pro Tools Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Leads Pro */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads (Pro)</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Manage All</div>
            <p className="text-xs text-muted-foreground mb-4">
              Advanced filtering, bulk actions, and exports.
            </p>
            <Button className="w-full" data-testid="agent-pro-open-leads-link" asChild>
              <Link href="/agent/workspace/leads">Open Leads</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Claims Queue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Claims Queue</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Processing</div>
            <p className="text-xs text-muted-foreground mb-4">
              Detailed claim review and adjudication tools.
            </p>
            <Button className="w-full" data-testid="agent-pro-open-queue-link" asChild>
              <Link href="/agent/workspace/claims">Open Queue</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Reports */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reports</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Analytics</div>
            <p className="text-xs text-muted-foreground mb-4">
              Performance metrics and commission reports.
            </p>
            <Button disabled variant="secondary" className="w-full">
              Coming Soon
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
