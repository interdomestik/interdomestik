'use client';

import { UsersTable } from '@/components/admin/users-table';
import { GlassCard } from '@/components/ui/glass-card';
import { isMember, isStaffOrAdmin } from '@/lib/roles';
import { cn } from '@interdomestik/ui';
import { Badge } from '@interdomestik/ui/components/badge';
import { ChevronDown, ExternalLink } from 'lucide-react';
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
  memberNumber?: string | null;
  unreadCount?: number;
  unreadClaimId?: string | null;
  alertLink?: string | null;
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
    <GlassCard className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between px-6 py-4 bg-white/5 hover:bg-white/10 transition-colors border-b border-white/10"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Badge variant="secondary" className="bg-white/10 text-muted-foreground border-white/10">
            {count}
          </Badge>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform text-muted-foreground', open && 'rotate-180')}
        />
      </button>
      {open && <div className="p-2">{children}</div>}
    </GlassCard>
  );
}

export function UsersSections({ users, agents }: UsersSectionsProps) {
  const t = useTranslations('admin.users_table');

  if (users.length === 0) {
    return (
      <GlassCard className="p-12 text-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center">
            <ExternalLink className="h-6 w-6 opacity-50" />
          </div>
          <p>{t('no_users')}</p>
        </div>
      </GlassCard>
    );
  }

  const members = users.filter(user => isMember(user.role));
  const assignedMembers = members.filter(member => member.agentId);
  const unassignedMembers = members.filter(member => !member.agentId);
  const agentsOnly = users.filter(user => user.role === 'agent');
  const staffMembers = users.filter(user => isStaffOrAdmin(user.role));

  return (
    <div className="space-y-6">
      {assignedMembers.length > 0 && (
        <Section title={t('sections.members')} count={assignedMembers.length}>
          <UsersTable
            users={assignedMembers}
            agents={agents}
            showEmptyState={false}
            showContainer={false}
          />
        </Section>
      )}
      {unassignedMembers.length > 0 && (
        <Section title={t('sections.unassigned')} count={unassignedMembers.length}>
          <UsersTable
            users={unassignedMembers}
            agents={agents}
            showEmptyState={false}
            showContainer={false}
          />
        </Section>
      )}
      {agentsOnly.length > 0 && (
        <Section title={t('sections.agents')} count={agentsOnly.length}>
          <UsersTable
            users={agentsOnly}
            agents={agents}
            showEmptyState={false}
            showContainer={false}
          />
        </Section>
      )}
      {staffMembers.length > 0 && (
        <Section title={t('sections.staff')} count={staffMembers.length}>
          <UsersTable
            users={staffMembers}
            agents={agents}
            showEmptyState={false}
            showContainer={false}
          />
        </Section>
      )}
    </div>
  );
}
