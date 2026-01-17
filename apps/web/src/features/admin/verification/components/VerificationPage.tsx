import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getVerificationRequestsAction } from '../actions/verification';
import { CashVerificationRequestDTO, VerificationView } from '../server/verification.core';
import { VerificationList } from './VerificationList';

type Props = {
  searchParams: Promise<{ view?: string; query?: string }>;
};

export default async function VerificationPage({ searchParams }: Props) {
  const t = await getTranslations('admin.leads');
  const session = await auth.api.getSession({ headers: await headers() });
  const params = await searchParams;

  const view = (params.view === 'history' ? 'history' : 'queue') as VerificationView;
  const query = params.query || '';

  const allowedRoles = ['admin', 'super_admin', 'branch_manager', 'tenant_admin', 'staff'];
  if (!session || !allowedRoles.includes(session.user.role)) {
    redirect('/admin');
  }

  // Fetch Verification Requests
  const result = await getVerificationRequestsAction({ view, query });
  const leads = (result?.success ? result.data : []) as CashVerificationRequestDTO[];

  return (
    <div className="container py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <VerificationList initialLeads={leads} initialParams={{ view, query }} />
    </div>
  );
}
