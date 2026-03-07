import { AgentDashboardV2Page } from '@/features/agent/dashboard/components/AgentDashboardV2Page';
import { auth } from '@/lib/auth';
import { requireEffectivePortalAccessOrNotFound } from '@/server/auth/effective-portal-access';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentTier } from './_layout.core';

export default async function AgentDashboardEntry({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect('/auth/login');
  }
  await requireEffectivePortalAccessOrNotFound(session, ['agent']);

  const tier = await getAgentTier({ agentId: session.user.id });

  // The V2Page component handles its own data fetching
  return <AgentDashboardV2Page locale={locale} tier={tier} />;
}
