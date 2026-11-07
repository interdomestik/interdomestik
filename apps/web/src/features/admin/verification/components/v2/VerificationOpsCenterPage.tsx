import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { GlassCard } from '@/components/ui/glass-card';
import { canReviewLeadDuplicates } from '@/features/admin/lead-duplicates/server/review-scope';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getVerificationRequestsAction } from '../../actions/verification';
import { CashVerificationRequestDTO, VerificationView } from '../../server/verification.core';
import { VerificationOpsCenterClient } from './VerificationOpsCenterClient';

type Props = {
  searchParams: Promise<{ view?: string; query?: string }>;
};

export default async function VerificationOpsCenterPage({ searchParams }: Props) {
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
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="verification-ops-page">
      <AdminPageHeader title={t('title')} subtitle={t('subtitle')} />
      {canReviewLeadDuplicates(session.user.role) ? (
        <Link
          href="/admin/leads?view=duplicates"
          data-testid="lead-duplicates-link"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('duplicates.tab')}
        </Link>
      ) : null}

      <GlassCard className="p-6">
        <VerificationOpsCenterClient initialData={leads} initialParams={{ view, query }} />
      </GlassCard>
    </div>
  );
}
