'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { Link } from '@/i18n/routing';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
import { useTranslations } from 'next-intl';

interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: Date;
  activeClaimsCount?: number;
  memberNumber?: string | null;
}

interface AgentMembersTableProps {
  readonly users: User[];
}

export function AgentMembersTable({ users }: AgentMembersTableProps) {
  const t = useTranslations('agent-members.members');
  const tCommon = useTranslations('common');

  return (
    <GlassCard className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-white/10">
            <TableHead>{t('table.headers.user')}</TableHead>
            <TableHead>Member ID</TableHead>
            <TableHead>{t('table.headers.active_claims')}</TableHead>
            <TableHead>{tCommon('joined')}</TableHead>
            <TableHead className="text-right">{t('table.headers.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                {t('table.no_users')}
              </TableCell>
            </TableRow>
          ) : (
            users.map(user => (
              <TableRow
                key={user.id}
                className="transition-colors border-white/5 hover:bg-white/5 dark:hover:bg-white/5"
                data-testid={`agent-member-row-${user.id}`}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-white/10">
                      <AvatarImage src={user.image || ''} />
                      <AvatarFallback className="bg-white/10 text-muted-foreground">
                        {user.name?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {user.memberNumber ? (
                    <code className="text-xs font-mono bg-white/5 px-1.5 py-0.5 rounded text-muted-foreground">
                      {user.memberNumber}
                    </code>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {user.activeClaimsCount && user.activeClaimsCount > 0 ? (
                    <Badge
                      variant="default"
                      className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-blue-500/30"
                    >
                      {user.activeClaimsCount} Active
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">0</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs hover:bg-blue-500/10 hover:text-blue-500 border border-white/10"
                  >
                    <Link href={`/agent/clients/${user.id}`}>{t('table.view_profile')}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </GlassCard>
  );
}
