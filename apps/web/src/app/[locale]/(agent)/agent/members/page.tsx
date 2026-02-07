import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Badge } from '@interdomestik/ui';
import { Link } from '@/i18n/routing';
import { getAgentMembersListReadModel } from '@/features/agent/members/server/get-agent-members-read-model';
import { auth } from '@/lib/auth';
import { AgentMembersSearch } from './components/agent-members-search';

export default async function AgentMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'agent-members' });

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect(`/${locale}/login`);
  }

  if (session.user.role !== 'agent') {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const rawSearch = typeof resolvedSearchParams?.q === 'string' ? resolvedSearchParams.q : '';
  const search = rawSearch.trim() || undefined;

  const { members } = await getAgentMembersListReadModel({
    agentId: session.user.id,
    tenantId: session.user.tenantId,
    query: search,
  });

  const attentionCount = members.filter(
    member => member.attentionState === 'needs_attention'
  ).length;
  const openClaimsTotal = members.reduce((sum, member) => sum + member.openClaimsCount, 0);

  return (
    <div data-testid="agent-dashboard-page">
      <section className="space-y-4" data-testid="agent-members-ready">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div>
            <h1 className="text-2xl font-bold">{t('members.cockpit.title')}</h1>
            <p className="text-muted-foreground">{t('members.cockpit.description')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2" data-testid="agent-primary-actions">
            <Link
              href="/agent/members"
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              data-testid="agent-members-cta"
            >
              {t('members.cockpit.my_members_cta')}
            </Link>
            <Link
              href="/agent/claims"
              className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium"
              data-testid="agent-claims-queue-cta"
            >
              {t('members.cockpit.claims_queue_cta')}
            </Link>
          </div>

          <div className="grid gap-2 sm:grid-cols-2" data-testid="agent-attention-queue">
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('members.cockpit.needs_attention_label')}
              </p>
              <p className="mt-1 text-xl font-semibold">{attentionCount}</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('members.cockpit.open_claims_label')}
              </p>
              <p className="mt-1 text-xl font-semibold">{openClaimsTotal}</p>
            </div>
          </div>

          <Link
            href="/agent/crm"
            className="inline-flex w-fit items-center text-sm font-medium underline-offset-4 hover:underline"
            data-testid="agent-support-link"
          >
            {t('members.cockpit.support_link')}
          </Link>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <AgentMembersSearch initialQuery={search ?? ''} />
        </div>

        {members.length === 0 && search ? (
          <div data-testid="agent-members-no-results">No results found.</div>
        ) : null}

        {members.length === 0 && !search ? (
          <div data-testid="agent-members-empty">No members assigned yet.</div>
        ) : null}

        {members.length > 0 ? (
          <div data-testid="agent-members-list" className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2">Member</th>
                  <th className="py-2">Member number</th>
                  <th className="py-2">Open claims</th>
                  <th className="py-2">Attention</th>
                  <th className="py-2">View</th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.memberId} data-testid="agent-member-row" className="border-t">
                    <td className="py-3">
                      <Link
                        href={`/agent/members/${member.memberId}`}
                        data-testid="agent-member-link"
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {member.name}
                      </Link>
                    </td>
                    <td className="py-3">{member.memberNumber ?? '—'}</td>
                    <td className="py-3">{member.openClaimsCount}</td>
                    <td className="py-3">
                      <Badge
                        variant={
                          member.attentionState === 'needs_attention' ? 'warning' : 'success'
                        }
                        data-testid="agent-member-attention-badge"
                      >
                        {member.attentionState === 'needs_attention'
                          ? 'Needs attention'
                          : 'Up to date'}
                      </Badge>
                    </td>
                    <td className="py-3" data-testid="agent-member-view-cell">
                      <Link
                        href={`/agent/members/${member.memberId}`}
                        data-testid="agent-member-view-link"
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                        aria-label={
                          member.memberNumber
                            ? `View member ${member.name} (membership ${member.memberNumber})`
                            : `View member ${member.name}`
                        }
                      >
                        View member
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
