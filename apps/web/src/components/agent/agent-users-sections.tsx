'use client';

import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
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
  unreadCount?: number;
  alertLink?: string | null;
};

type UsersSectionsProps = {
  users: User[];
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

export function AgentUsersSections({ users }: UsersSectionsProps) {
  const t = useTranslations('agent.users_table');
  const tCommon = useTranslations('common');

  if (users.length === 0) {
    return (
      <div className="rounded-md border bg-white py-16 text-center text-sm text-muted-foreground">
        {t('no_users')}
      </div>
    );
  }

  const members = users.filter(user => user.role === 'user');
  const needsAttention = members.filter(user => user.unreadCount);
  const allMembers = members.filter(user => !user.unreadCount);

  const renderTable = (rows: User[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('headers.user')}</TableHead>
          <TableHead>{t('headers.assigned_agent')}</TableHead>
          <TableHead>{t('headers.joined')}</TableHead>
          <TableHead className="text-right">{t('headers.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(member => (
          <TableRow
            key={member.id}
            className={member.unreadCount ? 'bg-amber-50/40 hover:bg-amber-50/60' : undefined}
          >
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={member.image || ''} />
                  <AvatarFallback>{member.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium">{member.name}</span>
                  <span className="text-xs text-muted-foreground">{member.email}</span>
                  <Button asChild size="sm" variant="outline" className="mt-2 h-7 px-2 text-xs">
                    <Link href={`/agent/users/${member.id}`}>{t('view_profile')}</Link>
                  </Button>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {member.agent?.name || tCommon('none')}
            </TableCell>
            <TableCell className="text-sm">
              {new Date(member.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-right">
              {member.unreadCount && member.alertLink ? (
                <Button
                  asChild
                  size="sm"
                  className="gap-2 animate-pulse bg-amber-500 text-white hover:bg-amber-600"
                >
                  <Link href={member.alertLink}>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                    </span>
                    {t('message_alert', { count: member.unreadCount })}
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/agent/users/${member.id}`}>{t('view_profile')}</Link>
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      {needsAttention.length > 0 && (
        <Section title={t('sections.attention')} count={needsAttention.length}>
          {renderTable(needsAttention)}
        </Section>
      )}
      {allMembers.length > 0 && (
        <Section title={t('sections.all')} count={allMembers.length} defaultOpen={false}>
          {renderTable(allMembers)}
        </Section>
      )}
    </div>
  );
}
