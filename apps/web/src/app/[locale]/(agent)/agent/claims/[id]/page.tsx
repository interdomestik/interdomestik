import { MemberClaimDetailOpsPage } from '@/features/member/claims/components/MemberClaimDetailOpsPage';
import { auth } from '@/lib/auth';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAgentClaimDetail } from './_core';

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

export default async function AgentClaimDetailPage({ params }: PageProps) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect(`/${locale}/login`);
  }

  // Fetch with Agent Security Context
  let claim;
  try {
    claim = await getAgentClaimDetail(session.user.id, id);
  } catch (e) {
    // getAgentClaimDetail calls notFound() if invalid
    // but if it throws something else:
    return notFound();
  }

  if (!claim) {
    return notFound();
  }

  // Serialize dates for Client Component (same pattern as Member page)
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

  return <MemberClaimDetailOpsPage claim={serializedClaim} />;
}
