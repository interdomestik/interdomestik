import { getPendingCashAttemptsAction } from '@/actions/leads/verification';
import { type CashVerificationRequestDTO } from '@/actions/leads/verification.core';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminLeadsClient } from './_client';

export default async function AdminLeadsPage() {
  const t = await getTranslations('admin.leads');
  const session = await auth.api.getSession({ headers: await headers() });

  const allowedRoles = ['admin', 'super_admin', 'branch_manager', 'tenant_admin', 'staff'];
  if (!session || !allowedRoles.includes(session.user.role)) {
    redirect('/admin');
  }

  // Fetch 'payment_pending' attempts
  const result = await getPendingCashAttemptsAction();
  const leads = (result.success ? result.data : []) as CashVerificationRequestDTO[];

  return (
    <div className="container py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <AdminLeadsClient initialLeads={leads} />
    </div>
  );
}
