import { connection } from 'next/server';

import { StatsV2Page } from '@/features/public/stats/components/StatsV2Page';
export { generateLocaleStaticParams as generateStaticParams } from '@/app/_locale-static-params';

export const instant = false;

export default async function PublicStatsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  await connection();
  const { locale } = await params;
  return <StatsV2Page locale={locale} />;
}
