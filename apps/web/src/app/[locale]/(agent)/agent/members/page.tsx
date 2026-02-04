import { getAgentMembersList } from '@interdomestik/domain-agent';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

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
  const search = typeof resolvedSearchParams?.q === 'string' ? resolvedSearchParams.q : undefined;

  const members = await getAgentMembersList({
    agentId: session.user.id,
    tenantId: session.user.tenantId,
    locale,
    search,
  });

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">My Members</h1>
        <p className="text-muted-foreground">Read-only list of your assigned members.</p>
      </div>

      {members.length === 0 ? (
        <div data-testid="agent-members-empty">No members assigned yet.</div>
      ) : (
        <div data-testid="agent-members-list" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2">Member</th>
                <th className="py-2">Membership #</th>
                <th className="py-2">Active claims</th>
                <th className="py-2">Last updated</th>
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
                  <td className="py-3">{member.membershipNumber ?? '—'}</td>
                  <td className="py-3">{member.activeClaimsCount}</td>
                  <td className="py-3">
                    {member.lastUpdatedAt
                      ? new Date(member.lastUpdatedAt).toLocaleDateString(locale)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
