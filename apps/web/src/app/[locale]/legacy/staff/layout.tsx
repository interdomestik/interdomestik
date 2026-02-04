import StaffLayout from '@/app/[locale]/(staff)/staff/_core.entry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

export default function LegacyStaffLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return <StaffLayout params={params}>{children}</StaffLayout>;
}
