import { AdminUserDetailV2Page } from '@/features/admin/users/components/AdminUserDetailV2Page';

export default async function MemberProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  return <AdminUserDetailV2Page id={id} locale={locale} searchParams={sp} />;
}
