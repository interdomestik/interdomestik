import { redirect } from 'next/navigation';

export default async function AgentImportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<never> {
  const { locale } = await params;
  redirect(`/${locale}/agent/sponsors`);
}
