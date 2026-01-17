import { AgentClientDetailV2Page } from '@/features/agent/clients/components/AgentClientDetailV2Page';

export default async function AgentMemberProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <AgentClientDetailV2Page id={id} locale={locale} />;
}
