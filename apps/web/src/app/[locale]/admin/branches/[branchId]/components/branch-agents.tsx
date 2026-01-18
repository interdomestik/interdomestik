import type { BranchAgentRow } from '@/actions/branch-dashboard.types';
import { OpsTable } from '@/components/ops';
import { Badge } from '@interdomestik/ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
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

  const columns = [
    { key: 'rank', header: t('col_rank') },
    { key: 'name', header: t('col_agent_name') },
    { key: 'members', header: t('col_members'), className: 'text-right' },
    { key: 'active_claims', header: t('col_active_claims'), className: 'text-right' },
    { key: 'submitted_30d', header: t('col_submitted_30d'), className: 'text-right' },
  ];

  const rows = agents.map((agent, index) => {
    const rank = index + 1;
    const rankBadge = getRankBadge(rank);

    return {
      id: agent.agentId,
      cells: [
        rankBadge ? (
          <span className="text-lg" key="rank">
            {rankBadge}
          </span>
        ) : (
          <span className="text-muted-foreground" key="rank">
            #{rank}
          </span>
        ),
        <span key="name">{agent.agentName || t('unknown_agent')}</span>,
        <span key="members">{agent.memberCount}</span>,
        agent.activeClaimCount > 0 ? (
          <Badge variant="secondary" key="active_claims">
            {agent.activeClaimCount}
          </Badge>
        ) : (
          <span className="text-muted-foreground" key="active_claims">
            0
          </span>
        ),
        agent.submittedClaimsLast30Days > 0 ? (
          <Badge variant="default" key="submitted_30d">
            {agent.submittedClaimsLast30Days}
          </Badge>
        ) : (
          <span className="text-muted-foreground" key="submitted_30d">
            0
          </span>
        ),
      ],
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('agents_title')}</CardTitle>
        <CardDescription>{t('agents_description', { count: agents.length })}</CardDescription>
      </CardHeader>
      <CardContent>
        <OpsTable
          columns={columns}
          rows={rows}
          emptyLabel={t('no_agents')}
          containerClassName="border-none bg-transparent backdrop-blur-none"
        />
      </CardContent>
    </Card>
  );
}
