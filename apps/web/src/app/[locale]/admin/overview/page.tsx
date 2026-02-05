import { AdminDashboardV2Page } from '@/features/admin/dashboard-v2/components/AdminDashboardV2Page';
import { setRequestLocale } from 'next-intl/server';

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div data-testid="admin-page-ready">
      <AdminDashboardV2Page locale={locale} />
    </div>
  );
}
