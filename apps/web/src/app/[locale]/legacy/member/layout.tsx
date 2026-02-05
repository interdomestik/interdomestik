import MemberLayout from '@/app/[locale]/(app)/member/_core.entry';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

export default function LegacyMemberLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return <MemberLayout params={params}>{children}</MemberLayout>;
}
