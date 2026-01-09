import { listLeadsAction } from '@/actions/leads/dashboard';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AgentLeadsClient } from './_client';

export default async function AgentLeadsPage() {
  const t = await getTranslations('agent.leads_list');
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== 'agent') {
    redirect('/dashboard');
  }

  const leadsResult = await listLeadsAction({ status: undefined });
  const leads = leadsResult.success ? leadsResult.data : [];

  return (
    <div className="container py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <AgentLeadsClient initialLeads={leads as any} />
    </div>
  );
}
