import { AdminClaimDetailV2Page } from '@/features/admin/claims/components/AdminClaimDetailV2Page';

export default async function AdminClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  return <AdminClaimDetailV2Page id={id} locale={locale} />;
}
