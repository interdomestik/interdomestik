// v2.0.2-admin-claims-ops — Rewired to V2
import AdminClaimsV2Page from '@/features/admin/claims/components/AdminClaimsV2Page';
import { setRequestLocale } from 'next-intl/server';

export default async function AdminClaimsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminClaimsV2Page searchParams={searchParams} />;
}
