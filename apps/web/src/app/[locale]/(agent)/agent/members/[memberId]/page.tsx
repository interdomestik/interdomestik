import { AgentClientDetailV2Page } from '@/features/agent/clients/components/AgentClientDetailV2Page';

export default async function AgentMemberDetailPage({
  params,
}: {
  params: Promise<{ locale: string; memberId: string }>;
}) {
  const { locale, memberId } = await params;
  return <AgentClientDetailV2Page id={memberId} locale={locale} />;
}
