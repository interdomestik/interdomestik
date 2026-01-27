import { AgentMembersProPage } from '@/features/agent/clients/components/AgentMembersProPage';
import { getAgentMembers } from '@/features/agent/clients/server/get-agent-members';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { requireAgentPro } from '@/lib/agent-tier';
import { Button } from '@interdomestik/ui/components/button';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string }>;
};

export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  const { search } = await searchParams;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const { isPro } = await requireAgentPro(session);
  if (!isPro) {
    const t = await getTranslations('agent-members.members.pro_required');
    return (
      <div className="space-y-4" data-testid="agent-pro-required">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/agent/members">{t('cta')}</Link>
        </Button>
      </div>
    );
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

  return <AgentMembersProPage members={members} />;
}
