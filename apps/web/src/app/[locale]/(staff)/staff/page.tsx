export default async function StaffDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { redirect } = await import('next/navigation');
  redirect(`/${locale}/staff/claims`);
}
