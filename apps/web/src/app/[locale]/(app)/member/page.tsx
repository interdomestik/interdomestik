import { MemberDashboardView } from '@/components/dashboard/member-dashboard-view';
import { auth } from '@/lib/auth';
import { ErrorBoundary } from '@interdomestik/ui';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const requestHeaders = await headers();

  const session = await (async () => {
    try {
      return await auth.api.getSession({
        headers: requestHeaders,
      });
    } catch {
      return null;
    }
  })();

  if (!session) {
    redirect(`/${locale}/login`);
    return null;
  }

  const role = session.user.role;

  // Redirect agents to their sales portal
  if (role === 'agent') {
    redirect(`/${locale}/agent`);
    return null;
  }

  // Redirect staff to their operations portal
  if (role === 'staff') {
    redirect(`/${locale}/staff`);
    return null;
  }

  // Redirect admin to admin portal
  if (role === 'admin') {
    redirect(`/${locale}/admin`);
    return null;
  }

  // Members see their personal dashboard
  return (
    <ErrorBoundary>
      <MemberDashboardView userId={session.user.id} />
    </ErrorBoundary>
  );
}
