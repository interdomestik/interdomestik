'use client';

import { UsersTable } from '@/components/admin/users-table';
import { cn } from '@interdomestik/ui';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

type User = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  image: string | null;
  agentId: string | null;
  agent?: {
    id: string;
    name: string | null;
  } | null;
  createdAt: Date;
};

type Agent = {
  id: string;
  name: string | null;
};

type UsersSectionsProps = {
  users: User[];
  agents: Agent[];
};

type SectionProps = {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
};

function Section({ title, count, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-md border bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="text-sm text-muted-foreground">({count})</span>
        </div>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t p-4">{children}</div>}
    </section>
  );
}

export function UsersSections({ users, agents }: UsersSectionsProps) {
  const t = useTranslations('admin.users_table');

  if (users.length === 0) {
    return (
      <div className="rounded-md border bg-white py-16 text-center text-sm text-muted-foreground">
        {t('no_users')}
      </div>
    );
  }

  const members = users.filter(user => user.role === 'user');
  const assignedMembers = members.filter(member => member.agentId);
  const unassignedMembers = members.filter(member => !member.agentId);
  const agentsOnly = users.filter(user => user.role === 'agent' || user.role === 'admin');

  return (
    <div className="space-y-6">
      {assignedMembers.length > 0 && (
        <Section title={t('sections.members')} count={assignedMembers.length}>
          <UsersTable users={assignedMembers} agents={agents} showEmptyState={false} showContainer={false} />
        </Section>
      )}
      {unassignedMembers.length > 0 && (
        <Section title={t('sections.unassigned')} count={unassignedMembers.length}>
          <UsersTable users={unassignedMembers} agents={agents} showEmptyState={false} showContainer={false} />
        </Section>
      )}
      {agentsOnly.length > 0 && (
        <Section title={t('sections.agents')} count={agentsOnly.length}>
          <UsersTable users={agentsOnly} agents={agents} showEmptyState={false} showContainer={false} />
        </Section>
      )}
    </div>
  );
}
