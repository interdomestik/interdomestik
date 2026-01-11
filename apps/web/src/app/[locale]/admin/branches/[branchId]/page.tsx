import { BranchDashboardV2 } from '@/features/admin/branches/dashboard-v2/components/BranchDashboardV2';
import { getBranchDashboardV2Data } from '@/features/admin/branches/dashboard-v2/server/getBranchDashboardV2Data';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { ROLES } from '@interdomestik/shared-auth';
import { Button } from '@interdomestik/ui/components/button';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

export default async function BranchDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; branchId: string }>;
}) {
  const { locale, branchId } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await import('next/headers').then(m => m.headers()),
  });

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const userRole = session.user.role;

  // RBAC Pre-checks
  if (userRole === 'user' || userRole === ROLES.agent) {
    notFound();
  }

  if (userRole === ROLES.branch_manager && session.user.branchId !== branchId) {
    redirect(`/${locale}/admin/branches/${session.user.branchId}`);
  }

  // Fetch V2 Data
  const data = await getBranchDashboardV2Data(branchId);

  if (!data) {
    notFound();
  }

  const t = await getTranslations('admin.branches');

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

      <BranchDashboardV2 data={data} />
    </div>
  );
}
