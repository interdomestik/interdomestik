import { getBranchDashboard } from '@/actions/branch-dashboard';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { isBranchDashboardEnabled } from '@/lib/feature-flags';
import { ROLES } from '@interdomestik/shared-auth';
import { Button } from '@interdomestik/ui/components/button';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import { BranchAgents } from './components/branch-agents';
import { BranchHeader } from './components/branch-header';
import { BranchStats } from './components/branch-stats';

export default async function BranchDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; branchId: string }>;
}) {
  const { locale, branchId } = await params;
  setRequestLocale(locale);

  // Feature flag guard
  if (!isBranchDashboardEnabled()) {
    notFound();
  }

  const session = await auth.api.getSession({
    headers: await import('next/headers').then(m => m.headers()),
  });

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  // Branch manager redirect check (before data fetch)
  const userRole = session.user.role;
  if (userRole === ROLES.branch_manager && session.user.branchId !== branchId) {
    redirect(`/${locale}/admin/branches/${session.user.branchId}`);
  }

  // Agents and members cannot access
  if (userRole === ROLES.agent || userRole === 'user') {
    notFound();
  }

  const t = await getTranslations('admin.branches.dashboard');

  // Fetch branch dashboard data
  const result = await getBranchDashboard(branchId);

  if (!result.success || !result.data) {
    notFound();
  }

  const { branch, stats, agents } = result.data;

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/branches">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('back_to_branches')}
          </Link>
        </Button>
      </div>

      {/* Branch Header */}
      <BranchHeader branch={branch} />

      {/* Stats Cards */}
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 h-24 animate-pulse bg-muted rounded-lg" />
        }
      >
        <BranchStats stats={stats} />
      </Suspense>

      {/* Agents Table */}
      <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded-lg" />}>
        <BranchAgents agents={agents} />
      </Suspense>
    </div>
  );
}
