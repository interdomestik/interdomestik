import { AgentDashboardV2Page } from '@/features/agent/dashboard/components/AgentDashboardV2Page';
import { auth } from '@/lib/auth';
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

  // The V2Page component handles its own data fetching
  return <AgentDashboardV2Page locale={locale} />;
}
