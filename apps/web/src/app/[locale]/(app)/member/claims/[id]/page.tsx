import { getSessionSafe } from '@/components/shell/session';
import { notFound, redirect } from 'next/navigation';
import { getMemberClaimDetail } from '@/features/claims/tracking/server/getMemberClaimDetail';
import { MemberClaimDetailOpsPage } from '@/features/member/claims/components/MemberClaimDetailOpsPage';
import { setRequestLocale } from 'next-intl/server';

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

export default async function ClaimDetailsPage({ params }: PageProps) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const session = await getSessionSafe('MemberClaimDetailsPage');

  if (!session) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/member/claims/${id}`);
  }

  const claim = await getMemberClaimDetail(session, id);

  if (!claim) {
    return notFound();
  }

  // Serialize dates for Client Component
  const serializedClaim = {
    ...claim,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt?.toISOString() ?? null,
    matterAllowance: claim.matterAllowance
      ? {
          ...claim.matterAllowance,
          windowStart: claim.matterAllowance.windowStart.toISOString(),
          windowEnd: claim.matterAllowance.windowEnd.toISOString(),
        }
      : null,
    recoveryDecision: claim.recoveryDecision ?? null,
    documents: claim.documents.map(d => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
    timeline: claim.timeline.map(e => ({
      ...e,
      date: e.date.toISOString(),
    })),
  };

  return (
    <MemberClaimDetailOpsPage
      claim={serializedClaim}
      currentUser={{
        id: session.user.id,
        name: session.user.name ?? 'Member',
        image: session.user.image ?? null,
        role: session.user.role || 'member',
      }}
    />
  );
}
