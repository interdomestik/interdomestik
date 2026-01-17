import { AdminBranchesV2Page } from '@/features/admin/branches/components/AdminBranchesV2Page';

export default async function AdminBranchesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AdminBranchesV2Page locale={locale} />;
}
