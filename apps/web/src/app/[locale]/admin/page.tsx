export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { redirect } = await import('next/navigation');
  redirect(`/${locale}/admin/overview`);
}
