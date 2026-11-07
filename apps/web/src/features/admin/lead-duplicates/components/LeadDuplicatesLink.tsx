import { auth } from '@/lib/auth';
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

import { canReviewLeadDuplicates } from '../server/review-scope';

/** The entry to duplicate review from the verification page, shown only to duplicate reviewers. */
export async function LeadDuplicatesLink() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !canReviewLeadDuplicates(session.user.role)) return null;
  const t = await getTranslations('admin.leads.duplicates');

  return (
    <Link
      href="/admin/leads?view=duplicates"
      data-testid="lead-duplicates-link"
      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {t('tab')}
    </Link>
  );
}
