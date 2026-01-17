import { AdminDashboardV2Page } from '@/features/admin/dashboard-v2/components/AdminDashboardV2Page';

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AdminDashboardV2Page locale={locale} />;
}
