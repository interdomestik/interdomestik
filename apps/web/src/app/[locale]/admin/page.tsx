import { TenantAdminDashboardV2 } from '@/features/admin/dashboard-v2/components/TenantAdminDashboardV2';
import { getTenantAdminDashboardV2Data } from '@/features/admin/dashboard-v2/server/getTenantAdminDashboardV2Data';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { tenants } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { eq } from 'drizzle-orm';
import { Loader2 } from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { Suspense } from 'react';

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const tenantId = ensureTenantId(session);

  // Branch Manager Redirect (Rule: "Branch auto-redirect for branch managers")
  if (session?.user?.role === 'branch_manager' && session?.user?.branchId) {
    const { redirect } = await import('@/i18n/routing');
    redirect({ href: `/admin/branches/${session.user.branchId}`, locale });
  }

  // Forbidden for non-admins (Double check, although middleware should handle this)
  console.log('[DEBUG] AdminDashboardPage session role:', session?.user?.role);
  if (!['admin', 'tenant_admin', 'super_admin'].includes(session?.user?.role || '')) {
    console.log('[DEBUG] AdminDashboardPage Access Denied for role:', session?.user?.role);
    return <div>Access Denied (Role: {session?.user?.role || 'none'})</div>;
  }

  // Fetch V2 Data
  const dashboardData = await getTenantAdminDashboardV2Data(tenantId);

  // Get Tenant Name for display
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const tenantName = tenant?.name || 'Unknown Tenant';

  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TenantAdminDashboardV2 data={dashboardData} tenantName={tenantName} />
    </Suspense>
  );
}
