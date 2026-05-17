import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { getAgentMembersListReadModel } from '@/features/agent/members/server/get-agent-members-read-model';
import { auth } from '@/lib/auth';

type AgentMembersSearchParams = {
  q?: string;
};

export async function getAgentMembersPageData({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams?: AgentMembersSearchParams;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect(`/${locale}/login`);
  }

  if (session.user.role !== 'agent') {
    notFound();
  }

  const rawSearch = typeof searchParams?.q === 'string' ? searchParams.q : '';
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

  return {
    attentionCount,
    members,
    openClaimsTotal,
    search,
  };
}
