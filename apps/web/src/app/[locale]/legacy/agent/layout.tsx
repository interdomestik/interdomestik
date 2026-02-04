import AgentLayout from '@/app/[locale]/(agent)/agent/layout';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

export default function LegacyAgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return <AgentLayout params={params}>{children}</AgentLayout>;
}
