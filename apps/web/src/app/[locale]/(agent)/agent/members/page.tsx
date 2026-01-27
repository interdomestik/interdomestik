import { AgentMembersLitePage } from '@/features/agent/clients/components/AgentMembersLitePage';
import { getAgentMembers } from '@/features/agent/clients/server/get-agent-members';
import { auth } from '@/lib/auth';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ search?: string }>;
};

export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  const { search } = (await searchParams) ?? {};
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  let members = [];
  try {
    const result = await getAgentMembers({
      session: session as any,
      search,
    });
    members = result ?? [];
  } catch {
    redirect(`/${locale}/login`);
  }

  return <AgentMembersLitePage members={members} />;
}
