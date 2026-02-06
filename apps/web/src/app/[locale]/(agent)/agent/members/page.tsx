import { setRequestLocale } from 'next-intl/server';
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

  return (
    <section className="space-y-4" data-testid="agent-members-ready">
      <div>
        <h1 className="text-2xl font-bold">My Members</h1>
        <p className="text-muted-foreground">Read-only list of your assigned members.</p>
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
                      variant={member.attentionState === 'needs_attention' ? 'warning' : 'success'}
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
  );
}
