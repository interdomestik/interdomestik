import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
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

  const session = await auth.api.getSession({
    headers: await headers(),
  });

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
    documents: claim.documents.map(d => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
    timeline: claim.timeline.map(e => ({
      ...e,
      date: e.date.toISOString(),
    })),
  };

  // @ts-expect-error - Serialized dates mismatch Date type in DTO but compatible with Adapter
  return <MemberClaimDetailOpsPage claim={serializedClaim} />;
}
