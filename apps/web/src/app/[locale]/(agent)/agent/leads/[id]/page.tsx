import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { crmActivities, crmLeads } from '@interdomestik/database/schema';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { desc, eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export default async function LeadDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('agent.leads_page');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/auth/login');
  }

  const lead = await db.query.crmLeads.findFirst({
    where: eq(crmLeads.id, id),
    with: {
      activities: {
        orderBy: desc(crmActivities.createdAt),
      },
      deals: {
        with: {
          // If you had a relation to membershipPlans configured in schema.ts, you could include it:
          // plan: true,
        },
      },
    },
  });

  if (!lead) {
    notFound();
  }

  // Security check: ensure agent owns this lead
  if (lead.agentId !== session.user.id) {
    redirect('/agent/leads');
  }

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
          <Button variant="outline">Log Activity</Button>
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
              {lead.deals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deals created yet.</p>
              ) : (
                <div className="space-y-4">
                  {lead.deals.map(deal => (
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
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Activity History</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <p>No activities logged.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {lead.activities.map(activity => (
                    <div key={activity.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-muted border">
                          <span className="text-xs font-bold capitalize">{activity.type[0]}</span>
                        </div>
                        <div className="h-full w-px bg-border my-1"></div>
                      </div>
                      <div className="pb-8 last:pb-0">
                        <p className="text-sm font-medium">{activity.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
