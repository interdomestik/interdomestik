import { StatsV2Page } from '@/features/public/stats/components/StatsV2Page';
export { generateLocaleStaticParams as generateStaticParams } from '@/app/_locale-static-params';

export default async function PublicStatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <StatsV2Page locale={locale} />;
}
