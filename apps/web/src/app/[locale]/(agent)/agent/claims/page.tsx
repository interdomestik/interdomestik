import { AgentClaimsFilters } from '@/components/agent/agent-claims-filters';
import { AgentClaimsTable } from '@/components/agent/agent-claims-table';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function AgentClaimsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('agent');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('claims_queue')}</h1>
          <p className="text-muted-foreground">{t('manage_triage')}</p>
        </div>
      </div>

      <AgentClaimsFilters />
      <AgentClaimsTable />
    </div>
  );
}
