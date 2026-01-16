import { BranchHealthView } from '@/features/admin/branches/components/branch-health-view';
import { getBranchesWithKpis } from '@/features/admin/branches/server/getBranchesWithKpis';
import { auth } from '@/lib/auth';
import { ROLES } from '@interdomestik/shared-auth';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { CreateBranchDialog } from './components/create-branch-dialog';

export default async function AdminBranchesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await import('next/headers').then(m => m.headers()),
  });

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  // Only Admin/SuperAdmin/TenantAdmin/Staff should access this list page
  const userRole = session.user.role;
  if (
    userRole !== ROLES.super_admin &&
    userRole !== ROLES.admin &&
    userRole !== ROLES.tenant_admin &&
    userRole !== ROLES.staff
  ) {
    // Branch manager should be redirected to their specific dashboard if they try to access list
    if (userRole === ROLES.branch_manager && session.user.branchId) {
      redirect(`/${locale}/admin/branches/${session.user.branchId}`);
    }
    notFound();
  }

  const t = await getTranslations('admin.branches');
  const result = await getBranchesWithKpis();
  const branches = result.success ? (result.data ?? []) : [];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">
            {t('title')}
          </h2>
          <p className="text-muted-foreground mt-1">{t('description')}</p>
        </div>
        <CreateBranchDialog />
      </div>

      <BranchHealthView initialBranches={branches} />
    </div>
  );
}
