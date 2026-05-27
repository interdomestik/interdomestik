import {
  MemberDashboardView,
  getDashboardSupplementalData,
} from '@/components/dashboard/member-dashboard-view';
import { MemberDashboardSkeleton } from '@/components/dashboard/member-dashboard-skeleton';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { ErrorBoundary } from '@interdomestik/ui';
import { getMemberDashboardData } from '@interdomestik/domain-member';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getMemberDashboardCore } from './_core';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = requireSessionOrRedirect(await getSessionSafe('MemberDashboardPage'), locale);

  const result = getMemberDashboardCore({
    role: session.user.role,
    userId: session.user.id,
    locale,
  });

  if (result.kind === 'redirect') {
    redirect(result.to);
  }

  if (result.kind === 'forbidden') {
    notFound();
  }

  if (!session.user.tenantId) {
    notFound();
  }

  const dataPromise = getMemberDashboardData({
    memberId: result.userId,
    tenantId: session.user.tenantId,
  });

  const supplementalDataPromise = getDashboardSupplementalData({
    memberId: result.userId,
    tenantId: session.user.tenantId,
  });

  return (
    <ErrorBoundary>
      <Suspense fallback={<MemberDashboardSkeleton />}>
        <div data-testid="member-header">
          <MemberDashboardView
            dataPromise={dataPromise}
            supplementalDataPromise={supplementalDataPromise}
            locale={locale}
          />
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
