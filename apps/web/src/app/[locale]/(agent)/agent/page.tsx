import { AgentDashboardV2Page } from '@/features/agent/dashboard/components/AgentDashboardV2Page';

export default function AgentDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { locale } = params as any; // Temporary cast to fix TS error with Promise params
  return <AgentDashboardV2Page locale={locale} />;
}
