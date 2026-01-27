'use client';

import { AgentMembersFilters } from './AgentMembersFilters';
import { AgentMembersTable } from './AgentMembersTable';
import { useTranslations } from 'next-intl';

interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: string | null;
  activeClaimsCount?: number;
  memberNumber?: string | null;
}

interface AgentMembersProPageProps {
  members: User[];
}

export function AgentMembersProPage({ members }: AgentMembersProPageProps) {
  const t = useTranslations('agent-members.members');

  return (
    <div className="space-y-6" data-testid="agent-members-pro-ready">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('page.title')}</h1>
          <p className="text-muted-foreground">{t('page.description')}</p>
        </div>
      </div>

      <AgentMembersFilters />
      <AgentMembersTable users={members} />
    </div>
  );
}
