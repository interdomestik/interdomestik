import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { GlassCard } from '@/components/ui/glass-card';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { listLeadDuplicatesAction } from '../actions/lead-duplicates';
import type {
  DuplicateReferralRow,
  DuplicateReviewState,
} from '../server/list-duplicate-referrals';
import { canReviewLeadDuplicates } from '../server/review-scope';
import { LeadDuplicateReviewPanel } from './LeadDuplicateReviewPanel';

/** `/admin/leads?view=duplicates`: only duplicate reviewers; everyone else returns to the queue. */
export async function LeadDuplicatesPage({ state }: Readonly<{ state: DuplicateReviewState }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !canReviewLeadDuplicates(session.user.role)) {
    redirect('/admin/leads');
  }
  const t = await getTranslations('admin.leads');
  const result = await listLeadDuplicatesAction(state);
  const rows = (result?.success ? result.data : []) as DuplicateReferralRow[];

  return (
    <div className="space-y-6" data-testid="lead-duplicates-page">
      <AdminPageHeader title={t('title')} subtitle={t('subtitle')} />
      <GlassCard className="p-6">
        <LeadDuplicateReviewPanel rows={rows} state={state} />
      </GlassCard>
    </div>
  );
}
