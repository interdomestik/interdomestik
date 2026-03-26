import { CoverageMatrix } from '@/components/commercial/coverage-matrix';
import { buildCoverageMatrixProps } from '@/components/commercial/coverage-matrix-content';
import { getSessionSafe } from '@/components/shell/session';
import { MembershipOpsPage } from '@/features/member/membership/components/MembershipOpsPage';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getMemberDocumentsCore, getMemberSubscriptionsCore } from './_core';

export default async function MembershipPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const coverageMatrix = await getTranslations('coverageMatrix');
  const session = await getSessionSafe('MemberMembershipPage');

  if (!session) {
    redirect(`/${locale}/login`);
  }

  const subscriptions = await getMemberSubscriptionsCore({
    userId: session.user.id,
    tenantId: session.user.tenantId ?? null,
  });
  const documents = await getMemberDocumentsCore({
    userId: session.user.id,
    tenantId: session.user.tenantId ?? null,
  });

  return (
    <div data-testid="membership-page-ready">
      <div className="space-y-6">
        <CoverageMatrix
          {...buildCoverageMatrixProps(coverageMatrix, 'membership-coverage-matrix')}
        />
        <MembershipOpsPage subscriptions={subscriptions} documents={documents} />
      </div>
    </div>
  );
}
