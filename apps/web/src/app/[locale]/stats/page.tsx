import { StatsV2Page } from '@/features/public/stats/components/StatsV2Page';
export { generateLocaleStaticParams as generateStaticParams } from '@/app/_locale-static-params';

import { RequestBoundary } from '@/components/shell/request-boundary';

async function RequestStatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <StatsV2Page locale={locale} />;
}

export default function PublicStatsPage(props: Readonly<Parameters<typeof RequestStatsPage>[0]>) {
  return (
    <RequestBoundary>
      <RequestStatsPage {...props} />
    </RequestBoundary>
  );
}
