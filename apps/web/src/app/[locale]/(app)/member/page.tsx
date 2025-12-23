import { MemberDashboardView } from '@/components/dashboard/member-dashboard-view';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  const role = session.user.role;

  // Redirect agents to their sales portal
  if (role === 'agent') {
    redirect({ href: '/agent', locale });
  }

  // Redirect staff to their operations portal
  if (role === 'staff') {
    redirect({ href: '/staff', locale });
  }

  // Redirect admin to admin portal
  if (role === 'admin') {
    redirect({ href: '/admin', locale });
  }

  // Members see their personal dashboard
  return <MemberDashboardView userId={session.user.id} />;
}
