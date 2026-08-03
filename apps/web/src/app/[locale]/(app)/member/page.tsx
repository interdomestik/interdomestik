import {
  MemberDashboardView,
  getDashboardSupplementalData,
} from '@/components/dashboard/member-dashboard-view';
import { MemberDashboardSkeleton } from '@/components/dashboard/member-dashboard-skeleton';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { evaluateNeutralOtpHost } from '@/app/api/auth/[...all]/neutral-otp-boundary';
import { resolveDefaultPublicTenantId } from '@/lib/tenant/tenant-hosts';
import { ErrorBoundary } from '@interdomestik/ui';
import { getMemberDashboardData } from '@interdomestik/domain-member';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getMemberDashboardCore } from './_core';
import { withMemberActorRoleOnSession } from './actor-role-on-session';

// prettier-ignore
const canOfferDraftManager = (requestHeaders: Headers, rawRole: string | null | undefined, tenantId: string | null | undefined) => evaluateNeutralOtpHost(requestHeaders) && (rawRole === 'member' || rawRole === 'user') && tenantId === resolveDefaultPublicTenantId();

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = requireSessionOrRedirect(await getSessionSafe('MemberDashboardPage'), locale);
  const rawRole = session.user.role;
  const draftManagerAvailable = canOfferDraftManager(
    await headers(),
    rawRole,
    session.user.tenantId
  );
  const memberSession = withMemberActorRoleOnSession(session);
  const actorRoleOnSession = memberSession.user.role;

  if (!actorRoleOnSession) {
    notFound();
  }

  const result = getMemberDashboardCore({
    role: actorRoleOnSession,
    userId: memberSession.user.id,
    locale,
  });

  if (result.kind === 'redirect') {
    redirect(result.to);
  }

  if (result.kind === 'forbidden') {
    notFound();
  }

  if (!memberSession.user.tenantId) {
    notFound();
  }

  const dataPromise = getMemberDashboardData({
    memberId: result.userId,
    tenantId: memberSession.user.tenantId,
  }).then(data => ({
    ...data,
    member: {
      ...data.member,
      role: actorRoleOnSession,
    },
  }));

  const supplementalDataPromise = getDashboardSupplementalData({
    memberId: result.userId,
    tenantId: memberSession.user.tenantId,
  });

  return (
    <ErrorBoundary>
      <Suspense fallback={<MemberDashboardSkeleton />}>
        <div data-testid="member-header">
          <MemberDashboardView
            dataPromise={dataPromise}
            draftManagerAvailable={draftManagerAvailable}
            supplementalDataPromise={supplementalDataPromise}
            locale={locale}
          />
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
