import { AdminUserDetailV2Page } from '@/features/admin/users/components/AdminUserDetailV2Page';
import { getSessionSafe } from '@/components/shell/session';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { getTenantClassificationOptions } from './tenant-classification';
import { redirect } from 'next/navigation';
import { resolveAdminTenantAuthority } from './tenant-context';

export default async function MemberProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  const session = await getSessionSafe('AdminUserProfilePage');
  if (!session) {
    redirect(`/${locale}/login`);
  }
  // The authority must belong to the session user this page renders for; anything else reads nothing.
  const authorized = await authorizeSessionTenant().catch(() => null);
  const sessionAuthority =
    authorized && authorized.session.user.id === session.user?.id ? authorized.authority : null;
  const authority = await resolveAdminTenantAuthority({
    authority: sessionAuthority,
    role: session.user?.role ?? null,
    searchParams: sp,
  });
  const tenantClassificationOptions = getTenantClassificationOptions();

  return (
    <AdminUserDetailV2Page
      id={id}
      locale={locale}
      searchParams={sp}
      authority={authority}
      actorRole={session.user?.role ?? null}
      actorBranchId={session.user?.branchId ?? null}
      tenantClassificationOptions={tenantClassificationOptions}
    />
  );
}
