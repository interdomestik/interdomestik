import { AdminUserDetailV2Page } from '@/features/admin/users/components/AdminUserDetailV2Page';
import { getSessionSafe } from '@/components/shell/session';
import { redirect } from 'next/navigation';
import { resolveAdminTenantContext } from './tenant-context';

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
  const tenantId = await resolveAdminTenantContext({ session, searchParams: sp });

  return <AdminUserDetailV2Page id={id} locale={locale} searchParams={sp} tenantId={tenantId} />;
}
