import { getLeadActivities } from '@/actions/activities';
import { ActivityFeed } from '@/components/crm/activity-feed';
import { LogActivityDialog } from '@/components/crm/log-activity-dialog';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAgentLeadDetailsCore } from '@/app/[locale]/(agent)/agent/leads/[id]/_core';

export async function AgentLeadDetailV2Page({ id }: { id: string }) {
  const t = await getTranslations('agent.leads_page');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/auth/login');
  }

  const [leadResult, activities] = await Promise.all([
    getAgentLeadDetailsCore({ leadId: id, viewerAgentId: session.user.id }),
    getLeadActivities(id),
  ]);

  if (leadResult.kind === 'not_found') notFound();
  if (leadResult.kind === 'redirect') redirect(leadResult.href);

  const lead = leadResult.lead;
  const deals = leadResult.deals;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 pl-0 hover:bg-transparent">
            <Link href="/agent/leads">← Back to Leads</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">
            {lead.fullName || lead.companyName || 'Lead Details'}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-primary/10 text-primary">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {t(`stages.${lead.stage}` as any)}
            </span>
            <span className="text-sm text-muted-foreground">• {lead.source}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {/* We handle logging in the card below, but could also have one here */}
          <Button>Create Deal</Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-muted-foreground">Type</div>
                <div className="font-medium capitalize">{lead.type}</div>

                <div className="text-muted-foreground">Email</div>
                <div className="font-medium">{lead.email || '-'}</div>

                <div className="text-muted-foreground">Phone</div>
                <div className="font-medium">{lead.phone || '-'}</div>

                <div className="text-muted-foreground">Company</div>
                <div className="font-medium">{lead.companyName || '-'}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deals</CardTitle>
            </CardHeader>
            <CardContent>
              {deals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deals created yet.</p>
              ) : (
                <div className="space-y-4">
                  {deals.map(deal => (
                    <div
                      key={deal.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium text-sm">Membership Plan</p>
                        <p className="text-xs text-muted-foreground capitalize">{deal.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm">€ {(deal.valueCents || 0) / 100}</p>
                        <p className="text-xs text-muted-foreground">
                          {deal.closedAt ? new Date(deal.closedAt).toLocaleDateString() : 'Open'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Activity History</CardTitle>
              <LogActivityDialog entityId={id} entityType="lead" />
            </CardHeader>
            <CardContent className="px-0 flex-1">
              <ActivityFeed activities={activities} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
