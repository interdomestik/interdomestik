import {
  completeAgentLeadFollowUp,
  scheduleAgentLeadFollowUp,
} from '@/actions/agent-crm-follow-up';
import {
  AgentLeadDetailsAccessDeniedError,
  getAgentLeadDetailsCore,
} from '@/app/[locale]/(agent)/agent/leads/[id]/_core';
import { ActivityFeed } from '@/components/crm/activity-feed';
import { LogActivityDialog } from '@/components/crm/log-activity-dialog';
import type { AppLocale } from '@/i18n/locales';
import { Link, redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { crmLeadActivityRepository } from '@/adapters/crm/lead-activity-repository';
import { listCrmLeadFollowUpTasksForLead } from '@/adapters/crm/lead-follow-up-repository';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { getAgentCrmLeadActivities } from '@interdomestik/domain-crm/lead-activities';
import {
  deriveCrmLeadNextAction,
  type CrmLeadNextAction,
} from '@interdomestik/domain-crm/leads/follow-up';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { CheckCircle2, PlusCircle } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

type LeadDetailTranslator = Awaited<ReturnType<typeof getTranslations>>;

function localizeLeadStage(stage: string | null | undefined, t: LeadDetailTranslator) {
  switch (stage) {
    case 'new':
      return t('stages.new');
    case 'contacted':
      return t('stages.contacted');
    case 'qualified':
      return t('stages.qualified');
    case 'proposal':
      return t('stages.proposal');
    case 'negotiation':
      return t('stages.negotiation');
    case 'won':
      return t('stages.won');
    case 'lost':
      return t('stages.lost');
    default:
      return t('stages.unknown');
  }
}

function localizeLeadType(type: string | null | undefined, t: LeadDetailTranslator) {
  switch (type) {
    case 'individual':
      return t('types.individual');
    case 'business':
      return t('types.business');
    default:
      return type || t('emptyValue');
  }
}

function localizeDealStatus(status: string | null | undefined, t: LeadDetailTranslator) {
  switch (status) {
    case 'open':
      return t('dealStatuses.open');
    case 'won':
    case 'closed_won':
      return t('dealStatuses.won');
    case 'lost':
    case 'closed_lost':
      return t('dealStatuses.lost');
    default:
      return t('dealStatuses.unknown');
  }
}

function formatDealValue(valueCents: number | null | undefined, locale: AppLocale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
  }).format((valueCents ?? 0) / 100);
}

function formatFollowUpDate(value: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function AgentLeadFollowUpCard({
  id,
  locale,
  nextAction,
  t,
}: Readonly<{
  id: string;
  locale: AppLocale;
  nextAction: CrmLeadNextAction;
  t: LeadDetailTranslator;
}>) {
  return (
    <Card data-testid="agent-lead-follow-up-card">
      <CardHeader>
        <CardTitle>{t('followUp.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {nextAction.kind === 'none' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('followUp.empty')}</p>
            <form action={scheduleAgentLeadFollowUp}>
              <input type="hidden" name="leadId" value={id} />
              <input type="hidden" name="subject" value={t('followUp.defaultSubject')} />
              <Button type="submit" size="sm" data-testid="agent-lead-schedule-follow-up">
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                {t('followUp.scheduleNow')}
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="font-medium">{nextAction.subject}</p>
              <p className="text-sm text-muted-foreground">
                {nextAction.kind === 'follow_up_due'
                  ? t('followUp.dueNow')
                  : t('followUp.scheduled')}
                {' - '}
                {formatFollowUpDate(nextAction.scheduledAt, locale)}
              </p>
              {nextAction.description ? (
                <p className="mt-2 text-sm text-muted-foreground">{nextAction.description}</p>
              ) : null}
            </div>
            <form action={completeAgentLeadFollowUp}>
              <input type="hidden" name="leadId" value={id} />
              <input type="hidden" name="activityId" value={nextAction.activityId} />
              <input type="hidden" name="source" value={nextAction.source ?? 'legacy_activity'} />
              {nextAction.source === 'crm_task' && nextAction.expectedLifecycleVersion ? (
                <input
                  type="hidden"
                  name="expectedLifecycleVersion"
                  value={nextAction.expectedLifecycleVersion}
                />
              ) : null}
              <Button
                type="submit"
                size="sm"
                variant="outline"
                data-testid="agent-lead-complete-follow-up"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t('followUp.complete')}
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export async function AgentLeadDetailV2Page({
  id,
  locale,
}: Readonly<{ id: string; locale: AppLocale }>) {
  setRequestLocale(locale);
  const t = await getTranslations('agent.leads_page');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect({ href: '/login', locale });
    return null;
  }

  const tenantId = ensureTenantId(session);
  const agentId = session.user.id;
  const role = session.user.role;
  const branchId = session.user.branchId ?? null;

  if (role !== 'agent' || !branchId) {
    notFound();
  }

  const actor = {
    actorId: agentId,
    role,
    scope: {
      agentId,
      branchId,
    },
    tenantId,
  } satisfies CrmActorContext;

  let leadResult;
  try {
    leadResult = await getAgentLeadDetailsCore({
      actor,
      leadId: id,
    });
  } catch (error) {
    if (error instanceof AgentLeadDetailsAccessDeniedError) {
      notFound();
    }
    throw error;
  }

  if (leadResult.kind === 'not_found') notFound();

  const activityResult = await getAgentCrmLeadActivities(
    {
      actor,
      leadId: id,
    },
    crmLeadActivityRepository
  );

  if (!activityResult.success) notFound();

  const lead = leadResult.lead;
  const deals = leadResult.deals;
  const activities = activityResult.activities;
  const taskBackedFollowUps = await listCrmLeadFollowUpTasksForLead({
    actor,
    leadId: id,
  });
  const nextAction = deriveCrmLeadNextAction({
    activities: [...taskBackedFollowUps, ...activities],
    lead: { id: lead.id, tenantId: lead.tenantId },
    now: new Date().toISOString(),
  });

  return (
    <div className="space-y-6" data-lead-id={id} data-testid="agent-lead-detail-ready">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 pl-0 hover:bg-transparent">
            <Link href="/agent/leads">{t('backToLeads')}</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">
            {lead.fullName || lead.companyName || t('detailTitleFallback')}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-primary/10 text-primary">
              {localizeLeadStage(lead.stage, t)}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('sourceLabel')}: {lead.source || t('emptyValue')}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled
            aria-disabled="true"
            data-testid="agent-lead-create-deal-unavailable"
          >
            {t('actions.createDealUnavailable')}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('detail.contactInformation')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-muted-foreground">{t('detail.type')}</div>
                <div className="font-medium">{localizeLeadType(lead.type, t)}</div>

                <div className="text-muted-foreground">{t('detail.email')}</div>
                <div className="font-medium">{lead.email || t('emptyValue')}</div>

                <div className="text-muted-foreground">{t('detail.phone')}</div>
                <div className="font-medium">{lead.phone || t('emptyValue')}</div>

                <div className="text-muted-foreground">{t('detail.company')}</div>
                <div className="font-medium">{lead.companyName || t('emptyValue')}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('deals.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {deals.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('deals.empty')}</p>
              ) : (
                <div className="space-y-4">
                  {deals.map(deal => (
                    <div
                      key={deal.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium text-sm">{t('deals.membershipPlan')}</p>
                        <p className="text-xs text-muted-foreground">
                          {localizeDealStatus(deal.status, t)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm">
                          {formatDealValue(deal.valueCents, locale)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {deal.closedAt
                            ? new Date(deal.closedAt).toLocaleDateString(locale)
                            : t('dealStatuses.open')}
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
          <AgentLeadFollowUpCard id={id} locale={locale} nextAction={nextAction} t={t} />

          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('activityHistory')}</CardTitle>
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
