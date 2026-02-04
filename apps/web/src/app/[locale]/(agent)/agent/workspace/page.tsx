import { Link } from '@/i18n/routing';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { ArrowLeft, BarChart3, FileText, LucideIcon, Users } from 'lucide-react';
import { getAgentWorkspaceNavCore } from './_core';

const ICON_MAP: Record<string, LucideIcon> = {
  users: Users,
  'file-text': FileText,
  'bar-chart': BarChart3,
};

export default async function AgentWorkspacePage() {
  // Purity: Page fetches data/context, then delegates to core
  const data = getAgentWorkspaceNavCore({});

  return (
    <div className="container py-6 space-y-8" data-testid="agent-pro-shell">
      {/* Header with Switch to Lite */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{data.pageTitle}</h1>
          <p className="text-muted-foreground mt-2">{data.pageSubtitle}</p>
        </div>
        <Link href="/agent/members">
          <Button variant="outline" className="gap-2" data-testid="agent-switch-lite">
            <ArrowLeft className="h-4 w-4" />
            Switch to Lite
          </Button>
        </Link>
      </div>

      {/* Pro Tools Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {data.cards.map(card => {
          const Icon = ICON_MAP[card.iconRequest] || FileText;
          return (
            <Card key={card.id} data-testid={`workspace-card-${card.id}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.headline}</div>
                <p className="text-xs text-muted-foreground mb-4">{card.description}</p>
                {card.disabled ? (
                  <Button disabled variant="secondary" className="w-full">
                    {card.actionText}
                  </Button>
                ) : (
                  <Link href={card.href || '#'}>
                    <Button className="w-full">{card.actionText}</Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
