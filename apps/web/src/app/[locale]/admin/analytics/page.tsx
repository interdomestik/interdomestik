import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

import { AnalyticsDashboard } from './_components/AnalyticsDashboard';
import { getAdminAnalyticsDataCore } from './_core';

export default async function AdminAnalyticsPage() {
  const session = await auth.api.getSession({
    headers: await import('next/headers').then(m => m.headers()),
  });

  if (!session?.user?.tenantId) {
    redirect('/login');
  }

  // Strict RBAC: Members cannot access admin analytics
  if (session.user.role === 'member') {
    const { notFound } = await import('next/navigation');
    notFound();
  }

  let data;
  try {
    data = await getAdminAnalyticsDataCore({ user: { tenantId: session.user.tenantId } });
  } catch (err: any) {
    if (err?.name === 'UnauthorizedError' || err?.message === 'Unauthorized') {
      const { notFound } = await import('next/navigation');
      notFound();
    }
    throw err;
  }

  return <AnalyticsDashboard data={data} />;
}
