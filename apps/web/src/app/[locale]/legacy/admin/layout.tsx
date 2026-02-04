import AdminLayout from '@/app/[locale]/admin/_core.entry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

export default function LegacyAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return <AdminLayout params={params}>{children}</AdminLayout>;
}
