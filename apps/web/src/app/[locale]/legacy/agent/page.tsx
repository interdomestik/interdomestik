import AgentDashboardEntry from '@/app/[locale]/(agent)/agent/_core.entry';

export default async function LegacyAgentPage({ params }: { params: Promise<{ locale: string }> }) {
  return <AgentDashboardEntry params={params} />;
}
