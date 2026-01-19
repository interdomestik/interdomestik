import { Link } from '@/i18n/routing';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { ArrowLeft, BarChart3, FileText, Users } from 'lucide-react';
export default async function AgentWorkspacePage() {
  return (
    <div className="container py-6 space-y-8" data-testid="agent-pro-shell">
      {/* Header with Switch to Lite */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Pro Workspace</h1>
          <p className="text-muted-foreground mt-2">Advanced tools and controls for power users.</p>
        </div>
        <Link href="/agent">
          <Button variant="outline" className="gap-2" data-testid="agent-switch-lite">
            <ArrowLeft className="h-4 w-4" />
            Switch to Lite
          </Button>
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
            <Link href="/agent/workspace/leads">
              <Button className="w-full">Open Leads</Button>
            </Link>
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
            <Link href="/agent/workspace/claims">
              <Button className="w-full">Open Queue</Button>
            </Link>
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
