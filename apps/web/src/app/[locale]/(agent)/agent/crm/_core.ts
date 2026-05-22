import { getAgentCrmDashboard, type AgentCrmDashboard } from '@interdomestik/domain-crm/dashboards';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmTaskWorkQueueItem } from '@interdomestik/domain-crm/tasks';
import {
  authorizeCrmReportingRead,
  deriveCrmSourceBreakdown,
  deriveCrmWeightedPipeline,
  deriveCrmWinRate,
  type CrmReportingAuthorizationDenialReason,
  type CrmReportingWindow,
} from '@interdomestik/domain-crm/reporting';
import type { CrmReportingRepository } from '@interdomestik/domain-crm/reporting/repository';

import { crmDashboardRepository } from '@/adapters/crm/dashboard-repository';
import { crmReportingRepository } from '@/adapters/crm/reporting-repository';
import {
  agentCrmTaskWorkQueueRepository,
  type AgentCrmTaskWorkQueueRepository,
} from '@/adapters/crm/task-work-queue-repository';

export type AgentCrmStats = AgentCrmDashboard;
export type { AgentCrmDashboardDueFollowUp as AgentCrmDueFollowUp } from '@interdomestik/domain-crm/dashboards';
export type AgentCrmTaskQueueItem = CrmTaskWorkQueueItem & {
  href: `/agent/leads/${string}`;
};

const CRM12_REPORTING_WINDOW_DAYS = 90;
const CRM12_MAX_SOURCE_ROWS = 5;

export class AgentCrmStatsAccessDeniedError extends Error {
  constructor(readonly reason: string) {
    super(`CRM dashboard read denied: ${reason}`);
    this.name = 'AgentCrmStatsAccessDeniedError';
  }
}

export class AgentCrmReportingAccessDeniedError extends Error {
  constructor(readonly reason: CrmReportingAuthorizationDenialReason) {
    super(`CRM reporting read denied: ${reason}`);
    this.name = 'AgentCrmReportingAccessDeniedError';
  }
}

export type AgentCrmPipelineCurrencySummary = {
  closedLostAmountMinor: number;
  closedWonAmountMinor: number;
  currencyCode: string;
  forecastBestAmountMinor: number;
  forecastCommitAmountMinor: number;
  forecastOmittedAmountMinor: number;
  forecastPipelineAmountMinor: number;
  openDealCount: number;
  rawValueAmountMinor: number;
  weightedValueAmountMinor: number;
};

export type AgentCrmSourceBreakdownSummary = {
  currencyCode: string;
  dealCount: number;
  rawValueAmountMinor: number;
  source: string | null;
  utmCampaign: string | null;
  utmMedium: string | null;
  utmSource: string | null;
  weightedValueAmountMinor: number;
  winRateBps: number;
};

export type AgentCrmWinRateSummary = {
  groupKey: string;
  lostCount: number;
  openCount: number;
  winRateBps: number;
  wonCount: number;
};

export type AgentCrmReportingDashboard = {
  sourceBreakdown: {
    excludedMissingCurrencyCount: number;
    excludedMissingValueCount: number;
    groups: AgentCrmSourceBreakdownSummary[];
  };
  weightedPipeline: {
    currencySummaries: AgentCrmPipelineCurrencySummary[];
    excludedRowCount: number;
  };
  winRateBySource: {
    groups: AgentCrmWinRateSummary[];
  };
  window: CrmReportingWindow;
};

export async function getAgentCrmStatsCore(args: {
  actor: CrmActorContext;
}): Promise<AgentCrmStats> {
  const result = await getAgentCrmDashboard({ actor: args.actor }, crmDashboardRepository, {
    now: () => new Date().toISOString(),
  });

  if (!result.success) {
    throw new AgentCrmStatsAccessDeniedError(result.reason);
  }

  return result.dashboard;
}

export async function getAgentCrmTaskQueueCore(args: {
  actor: CrmActorContext;
  now?: () => string;
  repository?: AgentCrmTaskWorkQueueRepository;
}): Promise<AgentCrmTaskQueueItem[]> {
  const repository = args.repository ?? agentCrmTaskWorkQueueRepository;
  const rows = await repository.readAgentTaskWorkQueue({
    actor: args.actor,
    now: (args.now ?? (() => new Date().toISOString()))(),
  });

  return rows.map(row => ({
    ...row,
    href: `/agent/leads/${encodeURIComponent(row.subjectReference.id)}`,
  }));
}

export function createAgentCrmReportingWindow(nowIso: string): CrmReportingWindow {
  const to = new Date(nowIso);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - CRM12_REPORTING_WINDOW_DAYS);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function summarizeWeightedPipeline(
  groups: ReturnType<typeof deriveCrmWeightedPipeline>['groups']
): AgentCrmPipelineCurrencySummary[] {
  const byCurrency = new Map<string, AgentCrmPipelineCurrencySummary>();
  for (const group of groups) {
    const summary = byCurrency.get(group.currencyCode) ?? {
      closedLostAmountMinor: 0,
      closedWonAmountMinor: 0,
      currencyCode: group.currencyCode,
      forecastBestAmountMinor: 0,
      forecastCommitAmountMinor: 0,
      forecastOmittedAmountMinor: 0,
      forecastPipelineAmountMinor: 0,
      openDealCount: 0,
      rawValueAmountMinor: 0,
      weightedValueAmountMinor: 0,
    };
    summary.closedLostAmountMinor += group.closedLostAmountMinor;
    summary.closedWonAmountMinor += group.closedWonAmountMinor;
    summary.forecastBestAmountMinor += group.forecastBestAmountMinor;
    summary.forecastCommitAmountMinor += group.forecastCommitAmountMinor;
    summary.forecastOmittedAmountMinor += group.forecastOmittedAmountMinor;
    summary.forecastPipelineAmountMinor += group.forecastPipelineAmountMinor;
    summary.openDealCount += group.openDealCount;
    summary.rawValueAmountMinor += group.rawValueAmountMinor;
    summary.weightedValueAmountMinor += group.weightedValueAmountMinor;
    byCurrency.set(group.currencyCode, summary);
  }
  return [...byCurrency.values()].sort((left, right) =>
    left.currencyCode.localeCompare(right.currencyCode)
  );
}

function sourceLabelKey(source: AgentCrmSourceBreakdownSummary): string {
  return source.source ?? source.utmSource ?? 'unknown';
}

function sortSourceSummaries(
  groups: AgentCrmSourceBreakdownSummary[]
): AgentCrmSourceBreakdownSummary[] {
  return groups.sort((left, right) => {
    if (right.dealCount !== left.dealCount) return right.dealCount - left.dealCount;
    return sourceLabelKey(left).localeCompare(sourceLabelKey(right));
  });
}

function countWeightedExclusions(report: ReturnType<typeof deriveCrmWeightedPipeline>): number {
  return (
    report.excludedArchivedCount +
    report.excludedInconsistentForecastCount +
    report.excludedMissingCurrencyCount +
    report.excludedMissingPipelineCount +
    report.excludedMissingStageCount +
    report.excludedMissingValueCount
  );
}

export async function getAgentCrmReportingCore(args: {
  actor: CrmActorContext;
  now?: () => string;
  repository?: CrmReportingRepository;
}): Promise<AgentCrmReportingDashboard> {
  const repository = args.repository ?? crmReportingRepository;
  const window = createAgentCrmReportingWindow((args.now ?? (() => new Date().toISOString()))());
  const denied = authorizeCrmReportingRead({
    actor: args.actor,
    grouping: 'source',
    window,
  });
  if (denied) {
    throw new AgentCrmReportingAccessDeniedError(denied);
  }

  const input = { actor: args.actor, window };
  const [weightedRows, sourceRows, winRateRows] = await Promise.all([
    repository.listWeightedPipelineRows(input),
    repository.listSourceBreakdownRows(input),
    repository.listWinRateRows(input),
  ]);

  const weightedPipeline = deriveCrmWeightedPipeline(weightedRows, {
    ...input,
    groupBy: ['agent', 'branch'],
  });
  const sourceBreakdown = deriveCrmSourceBreakdown(sourceRows, input);
  const winRateBySource = deriveCrmWinRate(winRateRows, { ...input, groupBy: 'source' });

  return {
    sourceBreakdown: {
      excludedMissingCurrencyCount: sourceBreakdown.excludedMissingCurrencyCount,
      excludedMissingValueCount: sourceBreakdown.excludedMissingValueCount,
      groups: sortSourceSummaries(sourceBreakdown.groups).slice(0, CRM12_MAX_SOURCE_ROWS),
    },
    weightedPipeline: {
      currencySummaries: summarizeWeightedPipeline(weightedPipeline.groups),
      excludedRowCount: countWeightedExclusions(weightedPipeline),
    },
    winRateBySource: {
      groups: winRateBySource.groups.slice(0, CRM12_MAX_SOURCE_ROWS),
    },
    window,
  };
}
