import { MemberDashboardView } from '@/components/dashboard/member-dashboard-view';
import { MemberDashboardSkeleton } from '@/components/dashboard/member-dashboard-skeleton';
import { auth } from '@/lib/auth';
import { ErrorBoundary } from '@interdomestik/ui';
import { getMemberDashboardData } from '@interdomestik/domain-member';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { isAgentAssignedToMember } from './_core';

export default async function AgentMemberDetailPage({
  params,
}: {
  params: Promise<{ locale: string; memberId: string }>;
}) {
  const { locale, memberId } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect(`/${locale}/login`);
  }

  if (session.user.role !== 'agent') {
    notFound();
  }

  const isAssigned = await isAgentAssignedToMember({
    agentId: session.user.id,
    tenantId: session.user.tenantId,
    memberId,
  });

  if (!isAssigned) {
    notFound();
  }

  let data;
  try {
    data = await getMemberDashboardData({
      memberId,
      tenantId: session.user.tenantId,
      locale,
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
        <MemberDashboardView data={data} locale={locale} />
      </Suspense>
    </ErrorBoundary>
  );
}
