import { AgentLeadDetailV2Page } from '@/features/agent/leads/components/AgentLeadDetailV2Page';

export default async function LeadDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentLeadDetailV2Page id={id} />;
}
