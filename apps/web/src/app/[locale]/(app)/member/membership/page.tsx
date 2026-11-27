import { MemberAcceptanceStep } from '@/components/privacy/member-acceptance-step';
import { requireMemberAcceptancePage } from '@/lib/privacy/require-member-acceptance';
import { CoverageMatrix } from '@/components/commercial/coverage-matrix';
import { buildCoverageMatrixProps } from '@/components/commercial/coverage-matrix-content';
import { MembershipOpsPage } from '@/features/member/membership/components/MembershipOpsPage';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  getMemberDocumentsCore,
  getMemberLeavableSponsorEntryCore,
  getMemberSubscriptionsCore,
} from './_core';

export default async function MembershipPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const coverageMatrix = await getTranslations({ locale, namespace: 'coverageMatrix' });
  const admission = await requireMemberAcceptancePage();
  if (!admission.ok) return <MemberAcceptanceStep locale={locale} refusal={admission} />;
  const { session } = admission.authorized;

  const tenantId = ensureTenantId(session);
  const subscriptions = await getMemberSubscriptionsCore({
    userId: session.user.id,
    tenantId,
  });
  const documents = await getMemberDocumentsCore({
    userId: session.user.id,
    tenantId,
  });
  // With a subscription record the detail view carries the leave action itself.
  const leaveEntryId =
    subscriptions.length === 0
      ? await getMemberLeavableSponsorEntryCore({ userId: session.user.id, tenantId })
      : null;

  return (
    <div data-testid="membership-page-ready" className="min-w-0 p-4 sm:p-6 md:p-0">
      <MembershipOpsPage
        subscriptions={subscriptions}
        documents={documents}
        leaveEntryId={leaveEntryId}
        coverage={
          <CoverageMatrix
            {...buildCoverageMatrixProps(coverageMatrix, 'membership-coverage-matrix')}
          />
        }
      />
    </div>
  );
}
