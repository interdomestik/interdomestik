import { getAgentUsers } from '@/actions/agent-users';
import { AgentUsersFilters } from '@/components/agent/agent-users-filters';
import { AgentUsersSections } from '@/components/agent/agent-users-sections';
import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string }>;
};

export default async function AgentUsersPage({ params, searchParams }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query = await searchParams;
  const users = await getAgentUsers({ search: query.search });
  const t = await getTranslations('agent-members.members.page');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/agent/clients/new">{t('register_member') || 'Register Member'}</Link>
        </Button>
      </div>

      <AgentUsersFilters />
      <AgentUsersSections users={users} />
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
