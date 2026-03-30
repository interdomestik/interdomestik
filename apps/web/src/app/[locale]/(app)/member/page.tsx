import { MemberDashboardV2 } from '@/components/dashboard/member-dashboard-v2';
import { MemberDashboardView } from '@/components/dashboard/member-dashboard-view';
import { MemberDashboardSkeleton } from '@/components/dashboard/member-dashboard-skeleton';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { isUiV2Enabled } from '@/lib/flags';
import { ErrorBoundary } from '@interdomestik/ui';
import { getMemberDashboardData } from '@interdomestik/domain-member';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getMemberDashboardCore } from './_core';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const uiV2Enabled = isUiV2Enabled();

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

  let data;
  try {
    data = await getMemberDashboardData({
      memberId: result.userId,
      tenantId: session.user.tenantId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Member not found') {
      notFound();
    }
    throw error;
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<MemberDashboardSkeleton />}>
        <div data-testid="member-header">
          {uiV2Enabled ? (
            <MemberDashboardV2
              data={data}
              locale={locale}
              tenantId={session.user.tenantId ?? null}
            />
          ) : (
            <MemberDashboardView data={data} locale={locale} />
          )}
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
