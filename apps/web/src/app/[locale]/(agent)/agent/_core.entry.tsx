import { AgentDashboardV2Page } from '@/features/agent/dashboard/components/AgentDashboardV2Page';
import { auth } from '@/lib/auth';
import { requireEffectivePortalAccessOrNotFound } from '@/server/auth/effective-portal-access';
import { db } from '@interdomestik/database/db';
import { agentSettings } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

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

  // Fetch tier
  let tier = 'standard';
  const settings = await db.query.agentSettings.findFirst({
    where: eq(agentSettings.agentId, session.user.id),
    columns: { tier: true },
  });
  if (settings?.tier) tier = settings.tier;

  // The V2Page component handles its own data fetching
  return <AgentDashboardV2Page locale={locale} tier={tier} />;
}
