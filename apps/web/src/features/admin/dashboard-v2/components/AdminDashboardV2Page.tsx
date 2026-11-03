import { TenantAdminDashboardV2 } from '@/features/admin/dashboard-v2/components/TenantAdminDashboardV2';
import { getTenantAdminDashboardV2Data } from '@/features/admin/dashboard-v2/server/getTenantAdminDashboardV2Data';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { readTenantDisplayName } from '@interdomestik/database/tenant-directory';
import { Loader2 } from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect as nextRedirect } from 'next/navigation';
import { Suspense } from 'react';

export async function AdminDashboardV2Page({ locale }: { locale: string }) {
  setRequestLocale(locale);

  const requestHeaders = await headers();
  // A failed session lookup or a session without a tenant both send the visitor to login.
  const authorized = await (async () => {
    try {
      return await authorizeSessionTenant(requestHeaders);
    } catch {
      return null;
    }
  })();

  if (!authorized) {
    nextRedirect(`/${locale}/login`);
    return null;
  }

  const { session, authority } = authorized;
  const { tenantId } = readTenantAuthority(authority);

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
  const dashboardData = await getTenantAdminDashboardV2Data(authority);

  // The tenant directory is deny-all to the runtime RLS role; its display name is a fixed
  // projection read for the authorized tenant only.
  const tenantName = (await readTenantDisplayName(tenantId)) || 'Unknown Tenant';

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
