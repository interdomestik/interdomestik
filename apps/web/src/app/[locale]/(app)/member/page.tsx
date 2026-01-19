import { MemberDashboardView } from '@/components/dashboard/member-dashboard-view';
import { auth } from '@/lib/auth';
import { ErrorBoundary } from '@interdomestik/ui';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getMemberDashboardCore } from './_core';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
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

  return (
    <ErrorBoundary>
      <MemberDashboardView userId={result.userId} />
    </ErrorBoundary>
  );
}
