import { AgentDashboardLite } from '@/features/agent/dashboard/components/AgentDashboardLite';
import { auth } from '@/lib/auth';
import { getAgentTier } from '@/lib/agent-tier';
import { db } from '@/lib/db.server';
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
    redirect(`/${locale}/login`);
  }

  const { isPro } = await getAgentTier(session);
  if (isPro) {
    redirect(`/${locale}/agent/workspace`);
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
