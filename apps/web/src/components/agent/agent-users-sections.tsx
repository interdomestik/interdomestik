'use client';

import { Link } from '@/i18n/routing';
import { Button, cn } from '@interdomestik/ui';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Badge } from '@interdomestik/ui/components/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

const membershipStatusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  past_due: 'bg-amber-100 text-amber-700 border-amber-200',
  paused: 'bg-slate-100 text-slate-700 border-slate-200',
  canceled: 'bg-rose-100 text-rose-700 border-rose-200',
  none: 'bg-muted text-muted-foreground border-transparent',
};

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
  subscription?: {
    status: string;
    planId: string | null;
    currentPeriodEnd: Date | null;
  } | null;
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
  const t = useTranslations('agent-members.members.table');
  const [showAllNeedsAttention, setShowAllNeedsAttention] = useState(false);
  const [showAllMembers, setShowAllMembers] = useState(false);

  if (users.length === 0) {
    return (
      <div className="rounded-md border bg-white py-16 text-center text-sm text-muted-foreground">
        {t('no_users')}
      </div>
    );
  }

  const members = users.filter(user => user.role === 'user');
  const needsAttentionRaw = members.filter(user => user.unreadCount);
  const allMembersRaw = members.filter(user => !user.unreadCount);

  const DISPLAY_LIMIT = 5;

  const needsAttention = showAllNeedsAttention
    ? needsAttentionRaw
    : needsAttentionRaw.slice(0, DISPLAY_LIMIT);
  const allMembers = showAllMembers ? allMembersRaw : allMembersRaw.slice(0, DISPLAY_LIMIT);

  const renderTable = (
    rows: User[],
    isLimited: boolean,
    onExpand: () => void,
    totalCount: number
  ) => (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('headers.user')}</TableHead>
            <TableHead>{t('headers.status') || 'Status'}</TableHead>
            <TableHead>{t('headers.plan') || 'Plan'}</TableHead>
            <TableHead>{t('headers.period_end') || 'Expires'}</TableHead>
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
                    <span className="font-medium text-foreground">{member.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{member.email}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  className={cn(
                    'font-medium text-[10px] uppercase tracking-wider',
                    membershipStatusStyles[member.subscription?.status || 'none']
                  )}
                  variant="outline"
                >
                  {member.subscription?.status || 'none'}
                </Badge>
              </TableCell>
              <TableCell className="text-sm font-bold">
                {member.subscription?.planId ? (
                  <span className="capitalize">{member.subscription.planId.replace('_', ' ')}</span>
                ) : (
                  <span className="opacity-30">-</span>
                )}
              </TableCell>
              <TableCell className="text-sm font-medium">
                {member.subscription?.currentPeriodEnd ? (
                  new Date(member.subscription.currentPeriodEnd).toLocaleDateString()
                ) : (
                  <span className="opacity-30">-</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant="outline" className="h-8 shadow-sm">
                  <Link href={`/agent/users/${member.id}`}>{t('view_profile')}</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {isLimited && totalCount > DISPLAY_LIMIT && (
        <div className="flex justify-center pt-2">
          <Button variant="ghost" size="sm" onClick={onExpand} className="text-primary font-bold">
            Expand All ({totalCount})
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {needsAttentionRaw.length > 0 && (
        <Section title={t('sections.attention')} count={needsAttentionRaw.length}>
          {renderTable(
            needsAttention,
            !showAllNeedsAttention,
            () => setShowAllNeedsAttention(true),
            needsAttentionRaw.length
          )}
        </Section>
      )}
      {allMembersRaw.length > 0 && (
        <Section
          title={t('sections.all')}
          count={allMembersRaw.length}
          defaultOpen={needsAttentionRaw.length === 0}
        >
          {renderTable(
            allMembers,
            !showAllMembers,
            () => setShowAllMembers(true),
            allMembersRaw.length
          )}
        </Section>
      )}
    </div>
  );
}
