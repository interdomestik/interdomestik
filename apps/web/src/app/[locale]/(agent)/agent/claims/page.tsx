import { AgentClaimsFilters } from '@/components/agent/agent-claims-filters';
import { AgentClaimsTable } from '@/components/agent/agent-claims-table';
import { auth } from '@/lib/auth';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

export default async function AgentClaimsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('agent');
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) return notFound();
  if (session.user.role !== 'staff' && session.user.role !== 'admin') return notFound();

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
