import { CoverageMatrix } from '@/components/commercial/coverage-matrix';
import { buildCoverageMatrixProps } from '@/components/commercial/coverage-matrix-content';
import { MembershipOpsPage } from '@/features/member/membership/components/MembershipOpsPage';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMemberDocumentsCore, getMemberSubscriptionsCore } from './_core';

export default async function MembershipPage() {
  const coverageMatrix = await getTranslations('coverageMatrix');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
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
