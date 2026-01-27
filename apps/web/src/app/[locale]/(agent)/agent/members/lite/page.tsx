import { AgentMembersLitePage } from '@/features/agent/clients/components/AgentMembersLitePage';
import { getAgentMembers } from '@/features/agent/clients/server/get-agent-members';
import { auth } from '@/lib/auth';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  let members = [];
  try {
    const result = await getAgentMembers({
      session: session as any,
    });
    members = result ?? [];
  } catch {
    redirect(`/${locale}/login`);
  }

  return <AgentMembersLitePage members={members} />;
}
