import { requireTenantAdminSession } from '@interdomestik/domain-users/admin/access';
import { AuthenticatedShell } from '@/components/shell/authenticated-shell';
import { StaffRoleShell } from '@/components/shell/staff-role-shell';
import { toClientShellUser } from '@/components/shell/client-shell-user';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { BASE_NAMESPACES, STAFF_NAMESPACES, pickMessages } from '@/i18n/messages';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { requireEffectivePortalAccessOrNotFound } from '@/server/auth/effective-portal-access';
import { getMessages, setRequestLocale } from 'next-intl/server';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

export default async function StaffLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [session, allMessages] = await Promise.all([
    getSessionSafe('StaffLayout'),
    getMessages({ locale }),
  ]);
  const sessionNonNull = requireSessionOrRedirect(session, locale);
  await requireEffectivePortalAccessOrNotFound(sessionNonNull, ['staff', 'branch_manager']);

  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, STAFF_NAMESPACES),
  };
  const shellUser = toClientShellUser(sessionNonNull.user);
  // A tenant RBAC admin grant is read under the staff user's own session authority.
  const authorized = await authorizeSessionTenant().catch(() => null);
  const adminAccess = await requireTenantAdminSession(sessionNonNull, authorized?.authority)
    .then(() => true)
    .catch(() => false);

  return (
    <AuthenticatedShell locale={locale} messages={messages}>
      <StaffRoleShell user={shellUser} adminAccess={adminAccess}>
        {children}
      </StaffRoleShell>
    </AuthenticatedShell>
  );
}
