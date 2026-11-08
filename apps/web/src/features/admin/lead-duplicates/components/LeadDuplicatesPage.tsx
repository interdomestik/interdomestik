import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { GlassCard } from '@/components/ui/glass-card';
import { Link } from '@/i18n/routing';
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
export async function LeadDuplicatesPage({
  state,
  locale,
}: Readonly<{ state: DuplicateReviewState; locale: string }>): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !canReviewLeadDuplicates(session.user.role)) {
    redirect('/admin/leads');
  }
  const t = await getTranslations({ locale, namespace: 'admin.leads' });
  const result = await listLeadDuplicatesAction(state);

  return (
    <div className="space-y-6" data-testid="lead-duplicates-page">
      <AdminPageHeader title={t('title')} subtitle={t('subtitle')} />
      <GlassCard className="p-6">
        {result.success ? (
          <LeadDuplicateReviewPanel
            locale={locale}
            rows={(result.data ?? []) as DuplicateReferralRow[]}
            state={state}
          />
        ) : (
          // A failed load must never read as a cleared queue: say so and offer a retry.
          <div role="alert" data-testid="lead-duplicates-error" className="space-y-2 text-sm">
            <p>{t('duplicates.load_error')}</p>
            <Link
              href={`/admin/leads?view=duplicates&state=${state}`}
              data-testid="lead-duplicates-retry"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('duplicates.retry')}
            </Link>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
