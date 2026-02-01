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
import { redirect as nextRedirect } from 'next/navigation';
import { Suspense } from 'react';

export async function AdminDashboardV2Page({ locale }: { locale: string }) {
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
    nextRedirect(`/${locale}/login`);
    return null;
  }

  const tenantId = (() => {
    try {
      return ensureTenantId(session);
    } catch {
      nextRedirect(`/${locale}/login`);
      return null;
    }
  })();

  if (!tenantId) return null;

  // Branch Manager Redirect (Rule: "Branch auto-redirect for branch managers")
  if (session?.user?.role === 'branch_manager' && session?.user?.branchId) {
    nextRedirect(`/${locale}/admin/branches/${session.user.branchId}`);
    return null;
  }

  // Forbidden for non-admins (defense in depth; proxy should also enforce)
  if (!['admin', 'tenant_admin', 'super_admin'].includes(session?.user?.role || '')) {
    const { notFound } = await import('next/navigation');
    notFound();
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
