'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { Link } from '@/i18n/routing';
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

interface Member {
  id: string;
  name: string | null;
  email: string;
  activeClaimsCount: number;
}

export function AgentMembersLitePage({ members }: { members: Member[] }) {
  const t = useTranslations('agent-members.members');

  return (
    <div className="space-y-6" data-testid="agent-members-lite-page-ready">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('page.title')} (Lite)</h1>
          <p className="text-muted-foreground">{t('page.description')}</p>
        </div>
      </div>

      <GlassCard className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.headers.user')}</TableHead>
              <TableHead>{t('table.headers.status')}</TableHead>
              <TableHead>{t('table.headers.active_claims')}</TableHead>
              <TableHead className="text-right">{t('table.headers.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  {t('table.no_users')}
                </TableCell>
              </TableRow>
            ) : (
              members.map(member => (
                <TableRow key={member.id} data-testid={`agent-member-row-${member.id}`}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{member.name}</div>
                      <div className="text-sm text-muted-foreground">{member.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-white/10 bg-white/5 text-muted-foreground"
                    >
                      Active
                    </Badge>
                  </TableCell>
                  <TableCell>{member.activeClaimsCount}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/agent/clients/${member.id}`}>{t('table.view_profile')}</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </GlassCard>
    </div>
  );
}
