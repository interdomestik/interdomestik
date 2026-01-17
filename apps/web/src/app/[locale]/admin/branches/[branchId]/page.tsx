import { BranchDashboardV2Page } from '@/features/admin/branches/components/BranchDashboardV2Page';

export default async function BranchDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; branchId: string }>;
}) {
  const { locale, branchId } = await params;
  return <BranchDashboardV2Page branchId={branchId} locale={locale} />;
}
