import { AgentDashboardLite } from '@/features/agent/dashboard/components/AgentDashboardLite';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentDashboardLiteCore } from './_core';

export default async function AgentDashboardEntry({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = (await params) as any;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  const result = await getAgentDashboardLiteCore({ agentId: session.user.id }, { db });

  return (
    <AgentDashboardLite
      locale={locale}
      newLeadsCount={result.newLeadsCount}
      activeClaimsCount={result.activeClaimsCount}
      assignedMembersCount={result.assignedMembersCount}
      followUpsCount={result.followUpsCount}
    />
  );
}
