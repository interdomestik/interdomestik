import AdminClaimsV2Page from '@/features/admin/claims/components/AdminClaimsV2Page';
import { setRequestLocale } from 'next-intl/server';

type AdminClaimsPageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}>;

export default async function AdminClaimsPage({ params, searchParams }: AdminClaimsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminClaimsV2Page searchParams={searchParams} />;
}
