import { StatsV2Page } from '@/features/public/stats/components/StatsV2Page';

export default async function PublicStatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <StatsV2Page locale={locale} />;
}
