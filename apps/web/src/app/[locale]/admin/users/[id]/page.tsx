import { AdminUserDetailV2Page } from '@/features/admin/users/components/AdminUserDetailV2Page';
import { getSessionSafe } from '@/components/shell/session';
import { redirect } from 'next/navigation';
import { buildTenantAwareUserProfilePath, hasTenantContext } from './tenant-context';

export default async function MemberProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;

  if (!hasTenantContext(sp)) {
    const session = await getSessionSafe('AdminUserProfilePage');
    const fallbackTenantId = session?.user?.tenantId;
    if (fallbackTenantId) {
      redirect(
        buildTenantAwareUserProfilePath({
          locale,
          userId: id,
          searchParams: sp,
          tenantId: fallbackTenantId,
        })
      );
    }
  }

  return <AdminUserDetailV2Page id={id} locale={locale} searchParams={sp} />;
}
