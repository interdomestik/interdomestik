import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAgentMemberDetail } from '@interdomestik/domain-agent';
import { auth } from '@/lib/auth';

export default async function AgentMemberDetailPage({
  params,
}: {
  params: Promise<{ locale: string; memberId: string }>;
}) {
  const { locale, memberId } = await params;
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

  const detail = await getAgentMemberDetail({
    agentId: session.user.id,
    tenantId: session.user.tenantId,
    memberId,
  });

  if (!detail) {
    notFound();
  }

  return (
    <section data-testid="agent-member-detail-ready" className="space-y-6">
      <header data-testid="agent-member-detail-header" className="space-y-1">
        <h1 className="text-2xl font-semibold">{detail.member.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          Membership #{detail.member.membershipNumber}
        </p>
      </header>

      <section data-testid="agent-member-detail-claims" className="space-y-3">
        <h2 className="text-lg font-semibold">Recent Claims</h2>
        {detail.recentClaims.length === 0 ? (
          <div
            data-testid="agent-member-detail-no-claims"
            className="text-sm text-muted-foreground"
          >
            No recent claims.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2">Claim #</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {detail.recentClaims.map(claim => (
                  <tr key={claim.id} className="border-t">
                    <td className="py-3">{claim.claimNumber}</td>
                    <td className="py-3">{claim.stageLabel}</td>
                    <td className="py-3">
                      {claim.updatedAt ? new Date(claim.updatedAt).toLocaleDateString(locale) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
