import { AgentLeadDetailV2Page } from '@/features/agent/leads/components/AgentLeadDetailV2Page';
import type { AppLocale } from '@/i18n/locales';

export default async function LeadDetailsPage({
  params,
}: Readonly<{
  params: Promise<{ locale: AppLocale; id: string }>;
}>) {
  const { locale, id } = await params;
  return <AgentLeadDetailV2Page id={id} locale={locale} />;
}
