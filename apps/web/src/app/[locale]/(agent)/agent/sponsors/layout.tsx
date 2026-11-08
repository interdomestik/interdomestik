import { SponsorLayout } from '@/features/sponsors/layout';

export default async function AgentSponsorsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  return <SponsorLayout locale={locale}>{children}</SponsorLayout>;
}
