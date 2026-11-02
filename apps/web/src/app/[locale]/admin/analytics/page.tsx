import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { MissingTenantError } from '@interdomestik/shared-auth';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { AnalyticsDashboard } from './_components/AnalyticsDashboard';
import { getAdminAnalyticsDataCore } from './_core';

type AdminAnalyticsPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function AdminAnalyticsPage({ params }: AdminAnalyticsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  let authorized: Awaited<ReturnType<typeof authorizeSessionTenant>>;
  try {
    authorized = await authorizeSessionTenant(await import('next/headers').then(m => m.headers()));
  } catch (error) {
    if (error instanceof MissingTenantError) redirect('/login');
    throw error;
  }

  if (!authorized) {
    redirect('/login');
  }
  const { session, authority } = authorized;

  // Strict RBAC: Members cannot access admin analytics
  if (session.user.role === 'member') {
    const { notFound } = await import('next/navigation');
    notFound();
  }

  let data;
  try {
    data = await getAdminAnalyticsDataCore(authority);
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : undefined;
    const message = err instanceof Error ? err.message : undefined;
    if (name === 'UnauthorizedError' || message === 'Unauthorized') {
      const { notFound } = await import('next/navigation');
      notFound();
    }
    throw err;
  }

  return <AnalyticsDashboard data={data} />;
}
