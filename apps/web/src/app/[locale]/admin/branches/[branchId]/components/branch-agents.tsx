import type { BranchAgentRow } from '@/actions/branch-dashboard.types';
import { Badge } from '@interdomestik/ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
import { getTranslations } from 'next-intl/server';

interface BranchAgentsProps {
  agents: BranchAgentRow[];
}

/**
 * Get rank badge based on position
 */
function getRankBadge(rank: number): string | null {
  switch (rank) {
    case 1:
      return '🥇';
    case 2:
      return '🥈';
    case 3:
      return '🥉';
    default:
      return null;
  }
}

export async function BranchAgents({ agents }: BranchAgentsProps) {
  const t = await getTranslations('admin.branches.dashboard');

  if (agents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('agents_title')}</CardTitle>
          <CardDescription>{t('no_agents')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('agents_title')}</CardTitle>
        <CardDescription>{t('agents_description', { count: agents.length })}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('col_rank')}</TableHead>
              <TableHead>{t('col_agent_name')}</TableHead>
              <TableHead className="text-right">{t('col_members')}</TableHead>
              <TableHead className="text-right">{t('col_active_claims')}</TableHead>
              <TableHead className="text-right">{t('col_submitted_30d')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent, index) => {
              const rank = index + 1;
              const rankBadge = getRankBadge(rank);

              return (
                <TableRow key={agent.agentId}>
                  <TableCell className="font-medium">
                    {rankBadge ? (
                      <span className="text-lg">{rankBadge}</span>
                    ) : (
                      <span className="text-muted-foreground">#{rank}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {agent.agentName || t('unknown_agent')}
                  </TableCell>
                  <TableCell className="text-right">{agent.memberCount}</TableCell>
                  <TableCell className="text-right">
                    {agent.activeClaimCount > 0 ? (
                      <Badge variant="secondary">{agent.activeClaimCount}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {agent.submittedClaimsLast30Days > 0 ? (
                      <Badge variant="default">{agent.submittedClaimsLast30Days}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
