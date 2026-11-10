import { AdminRoleShell } from '@/components/shell/admin-role-shell';
import type { AdminTenantOption } from '@/components/admin/admin-tenant-selector';
import { AdminTenantSelector } from '@/components/admin/admin-tenant-selector';
import { AuthenticatedShell } from '@/components/shell/authenticated-shell';
import { NavigationFeedback } from '@/components/shell/navigation-feedback';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { ADMIN_NAMESPACES, BASE_NAMESPACES, pickMessages } from '@/i18n/messages';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { requireEffectivePortalAccessOrNotFound } from '@/server/auth/effective-portal-access';
import { listSuperAdminTenantOptions } from '@interdomestik/database';
import { getMessages, setRequestLocale } from 'next-intl/server';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSessionSafe('AdminLayout');
  const sessionNonNull = requireSessionOrRedirect(session, locale);

  // Strict Isolation: Only allow admin, super_admin, tenant_admin, and branch_manager
  const ALLOWED_ROLES = ['admin', 'super_admin', 'tenant_admin', 'branch_manager'] as const;
  await requireEffectivePortalAccessOrNotFound(sessionNonNull, ALLOWED_ROLES);

  setRequestLocale(locale);
  const allMessages = await getMessages();
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, ADMIN_NAMESPACES),
  };

  const isSuperAdmin = sessionNonNull.user.role === 'super_admin';

  let tenantOptions: AdminTenantOption[] = [];
  if (isSuperAdmin) {
    try {
      // The tenant directory is deny-all to runtime roles: the selector comes from the platform
      // projection, which requires the super admin's own session authority.
      const authorized = await authorizeSessionTenant();
      tenantOptions = authorized ? await listSuperAdminTenantOptions(authorized.authority) : [];
    } catch (err) {
      console.error('[AdminLayout] SuperAdmin DB fetch failed:', err);
      // Fallback to empty to prevent 500
      tenantOptions = [];
    }
  }

  return (
    <div data-testid="admin-page-ready">
      <AuthenticatedShell locale={locale} messages={messages} enableNavigationFeedback={false}>
        <NavigationFeedback>
          <AdminRoleShell
            user={{
              branchId: sessionNonNull.user.branchId,
              name: sessionNonNull.user.name || 'Admin',
              email: sessionNonNull.user.email,
              role: sessionNonNull.user.role,
            }}
            tenantSelector={
              isSuperAdmin ? (
                <AdminTenantSelector
                  tenants={tenantOptions}
                  defaultTenantId={sessionNonNull.user.tenantId}
                />
              ) : null
            }
          >
            {children}
          </AdminRoleShell>
        </NavigationFeedback>
      </AuthenticatedShell>
    </div>
  );
}
