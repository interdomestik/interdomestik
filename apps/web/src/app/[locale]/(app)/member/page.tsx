import { MemberDashboardV2 } from '@/components/dashboard/member-dashboard-v2';
import { MemberDashboardView } from '@/components/dashboard/member-dashboard-view';
import { MemberDashboardSkeleton } from '@/components/dashboard/member-dashboard-skeleton';
import { auth } from '@/lib/auth';
import { isUiV2Enabled } from '@/lib/flags';
import { ErrorBoundary } from '@interdomestik/ui';
import { getMemberDashboardData } from '@interdomestik/domain-member';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getMemberDashboardCore } from './_core';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const uiV2Enabled = isUiV2Enabled();

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect(`/${locale}/login`);
  }

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
        {uiV2Enabled ? (
          <MemberDashboardV2 data={data} locale={locale} tenantId={session.user.tenantId ?? null} />
        ) : (
          <MemberDashboardView data={data} locale={locale} />
        )}
      </Suspense>
    </ErrorBoundary>
  );
}
