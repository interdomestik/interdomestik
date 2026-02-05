import {
  ClaimsOverviewList,
  MemberEmptyState,
  MemberHeader,
  SupportLink,
} from '@/components/member-dashboard';
import { auth } from '@/lib/auth';
import { getMemberDashboardData } from '@interdomestik/domain-member';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getMemberDashboardCore } from '@/app/[locale]/(app)/member/_core';

export default async function LegacyMemberPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

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
      locale,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Member not found') {
      notFound();
    }
    throw error;
  }

  return (
    <section className="space-y-6" data-testid="legacy-member-dashboard">
      <MemberHeader name={data.member.name} membershipNumber={data.member.membershipNumber} />
      {data.claims.length > 0 ? (
        <ClaimsOverviewList claims={data.claims} />
      ) : (
        <MemberEmptyState locale={locale} />
      )}
      <SupportLink href={data.supportHref} />
    </section>
  );
}
