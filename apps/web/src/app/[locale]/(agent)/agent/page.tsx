import { redirect } from 'next/navigation';

export default async function AgentRootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/agent/members`);
}
