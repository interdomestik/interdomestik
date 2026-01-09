import { listLeadsAction } from '@/actions/leads/dashboard';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminLeadsClient } from './_client';

export default async function AdminLeadsPage() {
  const t = await getTranslations('admin.leads');
  const session = await auth.api.getSession({ headers: await headers() });

  const allowedRoles = ['admin', 'super_admin', 'branch_manager', 'tenant_admin'];
  if (!session || !allowedRoles.includes(session.user.role)) {
    redirect('/admin'); // Staff redirected away
  }

  // Fetch 'payment_pending' leads to verify
  const leadsResult = await listLeadsAction({ status: 'payment_pending' });
  const leads = leadsResult.success ? leadsResult.data : [];

  return (
    <div className="container py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <AdminLeadsClient initialLeads={leads as any} />
    </div>
  );
}
