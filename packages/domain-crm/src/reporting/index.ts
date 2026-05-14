import { isMemberCrmActor, type CrmActorContext } from '../context';
import {
  CRM_REPORTING_DURATION_DECIMAL_PLACES,
  CRM_REPORTING_MAX_GROUP_ROWS,
  CRM_REPORTING_MAX_LEADERBOARD_ROWS,
  CRM_REPORTING_MAX_WINDOW_DAYS,
  CRM_REPORTING_PERCENT_DENOMINATOR,
} from './types';
import type {
  CrmAgentLeaderboardEntry,
  CrmAgentLeaderboardInput,
  CrmAgentLeaderboardReport,
  CrmAgentLeaderboardRow,
  CrmForecastSnapshotInput,
  CrmForecastSnapshotRow,
  CrmFunnelConversionInput,
  CrmFunnelConversionReport,
  CrmFunnelConversionRow,
  CrmReportingAuthorizationDenialReason,
  CrmReportingBaseInput,
  CrmReportingGrouping,
  CrmReportingWindow,
  CrmSourceBreakdownGroup,
  CrmSourceBreakdownReport,
  CrmSourceBreakdownRow,
  CrmStageVelocityInput,
  CrmStageVelocityReport,
  CrmStageVelocityRow,
  CrmWeightedPipelineGroup,
  CrmWeightedPipelineInput,
  CrmWeightedPipelineReport,
  CrmWeightedPipelineRow,
  CrmWinRateGroup,
  CrmWinRateInput,
  CrmWinRateReport,
  CrmWinRateRow,
} from './types';

export * from './repository';
export * from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isWithinWindow(value: string, window: CrmReportingWindow): boolean {
  const at = parseTime(value);
  return at >= parseTime(window.from) && at < parseTime(window.to);
}

function validateWindow(window: CrmReportingWindow): CrmReportingAuthorizationDenialReason | null {
  const from = parseTime(window.from);
  const to = parseTime(window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 'window_scope';
  if ((to - from) / MS_PER_DAY > CRM_REPORTING_MAX_WINDOW_DAYS) return 'window_scope';
  return null;
}

function daysBetween(from: string, to: string): number {
  return roundDecimal((parseTime(to) - parseTime(from)) / MS_PER_DAY);
}

function roundDecimal(value: number): number {
  const factor = 10 ** CRM_REPORTING_DURATION_DECIMAL_PLACES;
  return Math.round(value * factor) / factor;
}

function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

function toBasisPoints(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return roundHalfAwayFromZero((numerator / denominator) * CRM_REPORTING_PERCENT_DENOMINATOR);
}

function stableKey(parts: readonly (string | number | null | undefined)[]): string {
  return parts.map(part => String(part ?? '')).join('\u001f');
}

function sortByKey<T extends { groupKey?: string }>(rows: T[]): T[] {
  return rows.sort((left, right) => (left.groupKey ?? '').localeCompare(right.groupKey ?? ''));
}

export function authorizeCrmReportingRead(input: {
  actor: CrmActorContext;
  grouping?: CrmReportingGrouping | 'leaderboard';
  window: CrmReportingWindow;
}): CrmReportingAuthorizationDenialReason | null {
  if (!input.actor.tenantId) return 'tenant_scope';
  if (isMemberCrmActor(input.actor)) return 'role_scope';
  const invalidWindow = validateWindow(input.window);
  if (invalidWindow) return invalidWindow;

  if (input.actor.role === 'branch_manager' && !input.actor.scope.branchId) return 'branch_scope';
  if (input.actor.role === 'agent') {
    if (!input.actor.scope.agentId || input.actor.scope.agentId !== input.actor.actorId) {
      return 'agent_scope';
    }
    if (input.grouping === 'leaderboard') return 'agent_scope';
  }
  return null;
}

function assertAuthorized(
  input: CrmReportingBaseInput,
  grouping?: CrmReportingGrouping | 'leaderboard'
): void {
  const denied = authorizeCrmReportingRead({ actor: input.actor, grouping, window: input.window });
  if (denied) throw new Error(`CRM reporting read denied: ${denied}`);
}

export function deriveCrmFunnelConversion(
  rows: readonly CrmFunnelConversionRow[],
  input: CrmFunnelConversionInput
): CrmFunnelConversionReport {
  assertAuthorized(input);
  const groups = new Map<string, CrmFunnelConversionReport['stages'][number]>();

  for (const row of rows) {
    if (!isWithinWindow(row.enteredAt, input.window)) continue;
    const key = stableKey([row.pipelineId, row.stageId]);
    const group = groups.get(key) ?? {
      conversionRateBps: 0,
      dropOffRateBps: 0,
      enteredCount: 0,
      exitedCount: 0,
      lostCount: 0,
      pipelineId: row.pipelineId,
      stageId: row.stageId,
      wonCount: 0,
    };
    group.enteredCount += 1;
    if (row.exitedAt) group.exitedCount += 1;
    if (row.stageIsWon || row.kind === 'won') group.wonCount += 1;
    if (row.stageIsLost || row.kind === 'lost') group.lostCount += 1;
    groups.set(key, group);
  }

  const stages = [...groups.values()].map(group => ({
    ...group,
    conversionRateBps: toBasisPoints(group.wonCount, group.enteredCount),
    dropOffRateBps: toBasisPoints(group.lostCount, group.enteredCount),
  }));
  stages.sort((left, right) =>
    stableKey([left.pipelineId, left.stageId]).localeCompare(
      stableKey([right.pipelineId, right.stageId])
    )
  );
  return { excludedArchivedCount: 0, stages, window: input.window };
}

export function deriveCrmStageVelocity(
  rows: readonly CrmStageVelocityRow[],
  input: CrmStageVelocityInput
): CrmStageVelocityReport {
  assertAuthorized(input);
  const durations = new Map<string, { pipelineId: string; stageId: string; values: number[] }>();
  let excludedOpenIntervalCount = 0;

  for (const row of rows) {
    if (!isWithinWindow(row.enteredAt, input.window)) continue;
    const exit = row.exitedAt ?? (input.includeOpenIntervals ? input.now : null);
    if (!exit) {
      excludedOpenIntervalCount += 1;
      continue;
    }
    const duration = daysBetween(row.enteredAt, exit);
    if (!Number.isFinite(duration) || duration < 0) continue;
    const key = stableKey([row.pipelineId, row.stageId]);
    const group = durations.get(key) ?? {
      pipelineId: row.pipelineId,
      stageId: row.stageId,
      values: [],
    };
    group.values.push(duration);
    durations.set(key, group);
  }

  const stages = [...durations.values()].map(group => {
    const values = [...group.values].sort((left, right) => left - right);
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      averageDays: roundDecimal(total / values.length),
      maximumDays: values.at(-1) ?? 0,
      medianDays: values[Math.floor((values.length - 1) / 2)] ?? 0,
      minimumDays: values[0] ?? 0,
      pipelineId: group.pipelineId,
      sampleCount: values.length,
      stageId: group.stageId,
    };
  });
  stages.sort((left, right) =>
    stableKey([left.pipelineId, left.stageId]).localeCompare(
      stableKey([right.pipelineId, right.stageId])
    )
  );
  return { excludedOpenIntervalCount, stages, window: input.window };
}

function isInconsistentForecast(row: CrmWeightedPipelineRow): boolean {
  const isTerminal = row.isWonStage || row.isLostStage;
  return row.forecastCategory === 'closed' && !isTerminal;
}

function addWeighted(group: CrmWeightedPipelineGroup, row: CrmWeightedPipelineRow): void {
  const value = row.valueAmountMinor ?? 0;
  const weighted = roundHalfAwayFromZero((value * (row.stageProbability ?? 0)) / 100);

  if (row.isWonStage) {
    group.closedWonAmountMinor += value;
    return;
  }
  if (row.isLostStage) {
    group.closedLostAmountMinor += value;
    return;
  }

  group.openDealCount += 1;
  group.rawValueAmountMinor += value;
  group.weightedValueAmountMinor += weighted;
  if (row.forecastCategory === 'best') group.forecastBestAmountMinor += weighted;
  else if (row.forecastCategory === 'commit') group.forecastCommitAmountMinor += weighted;
  else if (row.forecastCategory === 'omitted') group.forecastOmittedAmountMinor += weighted;
  else group.forecastPipelineAmountMinor += weighted;
}

type CrmWeightedPipelineExclusionCounter =
  | 'excludedArchivedCount'
  | 'excludedInconsistentForecastCount'
  | 'excludedMissingCurrencyCount'
  | 'excludedMissingPipelineCount'
  | 'excludedMissingStageCount'
  | 'excludedMissingValueCount';

function getWeightedPipelineExclusion(
  row: CrmWeightedPipelineRow,
  input: CrmWeightedPipelineInput
): CrmWeightedPipelineExclusionCounter | null {
  if (row.archivedAt && !input.includeArchived) return 'excludedArchivedCount';
  if (!row.pipelineId) return 'excludedMissingPipelineCount';
  if (!row.currentStageId) return 'excludedMissingStageCount';
  if (!row.currencyCode) return 'excludedMissingCurrencyCount';
  if (row.valueAmountMinor == null) return 'excludedMissingValueCount';
  if (isInconsistentForecast(row)) return 'excludedInconsistentForecastCount';
  return null;
}

export function deriveCrmWeightedPipeline(
  rows: readonly CrmWeightedPipelineRow[],
  input: CrmWeightedPipelineInput
): CrmWeightedPipelineReport {
  assertAuthorized(input);
  const groupBy = new Set(input.groupBy ?? ['agent', 'branch', 'pipeline', 'stage']);
  const groups = new Map<string, CrmWeightedPipelineGroup>();
  const report: CrmWeightedPipelineReport = {
    excludedArchivedCount: 0,
    excludedInconsistentForecastCount: 0,
    excludedMissingCurrencyCount: 0,
    excludedMissingPipelineCount: 0,
    excludedMissingStageCount: 0,
    excludedMissingValueCount: 0,
    groups: [],
    window: input.window,
  };

  for (const row of rows) {
    const exclusion = getWeightedPipelineExclusion(row, input);
    if (exclusion) {
      report[exclusion] += 1;
      continue;
    }
    const currencyCode = row.currencyCode!;
    const currentStageId = row.currentStageId!;
    const pipelineId = row.pipelineId!;
    const agentId = groupBy.has('agent') ? (row.agentId ?? null) : null;
    const branchId = groupBy.has('branch') ? (row.branchId ?? null) : null;
    const stageId = groupBy.has('stage') ? currentStageId : null;
    const key = stableKey([row.tenantId, branchId, agentId, pipelineId, stageId, currencyCode]);
    const group = groups.get(key) ?? {
      agentId,
      branchId,
      closedLostAmountMinor: 0,
      closedWonAmountMinor: 0,
      currencyCode,
      forecastBestAmountMinor: 0,
      forecastCommitAmountMinor: 0,
      forecastOmittedAmountMinor: 0,
      forecastPipelineAmountMinor: 0,
      openDealCount: 0,
      pipelineId,
      rawValueAmountMinor: 0,
      stageId,
      tenantId: row.tenantId,
      weightedValueAmountMinor: 0,
    };
    addWeighted(group, row);
    groups.set(key, group);
  }

  report.groups = [...groups.values()]
    .sort((left, right) =>
      stableKey([
        left.tenantId,
        left.branchId,
        left.agentId,
        left.pipelineId,
        left.stageId,
        left.currencyCode,
      ]).localeCompare(
        stableKey([
          right.tenantId,
          right.branchId,
          right.agentId,
          right.pipelineId,
          right.stageId,
          right.currencyCode,
        ])
      )
    )
    .slice(0, CRM_REPORTING_MAX_GROUP_ROWS);
  return report;
}

export function deriveCrmForecastSnapshot(
  rows: readonly CrmWeightedPipelineGroup[],
  input: CrmForecastSnapshotInput
): CrmForecastSnapshotRow[] {
  const snapshots = new Map<string, CrmForecastSnapshotRow>();

  for (const row of rows) {
    const key = stableKey([row.tenantId, row.pipelineId, row.branchId, row.currencyCode]);
    const snapshot = snapshots.get(key) ?? {
      branchId: row.branchId ?? null,
      closedLostAmountMinor: 0,
      closedWonAmountMinor: 0,
      createdAt: input.createdAt,
      createdById: input.createdById ?? null,
      currencyCode: row.currencyCode,
      forecastBestAmountMinor: 0,
      forecastCommitAmountMinor: 0,
      forecastOmittedAmountMinor: 0,
      forecastPipelineAmountMinor: 0,
      idempotencyKey: input.idempotencyKey ?? null,
      openDealCount: 0,
      pipelineId: row.pipelineId,
      rawValueAmountMinor: 0,
      snapshotDate: input.snapshotDate,
      sourceRunId: input.sourceRunId ?? null,
      tenantId: row.tenantId,
      weightedValueAmountMinor: 0,
    };
    snapshot.closedLostAmountMinor += row.closedLostAmountMinor;
    snapshot.closedWonAmountMinor += row.closedWonAmountMinor;
    snapshot.forecastBestAmountMinor += row.forecastBestAmountMinor;
    snapshot.forecastCommitAmountMinor += row.forecastCommitAmountMinor;
    snapshot.forecastOmittedAmountMinor += row.forecastOmittedAmountMinor;
    snapshot.forecastPipelineAmountMinor += row.forecastPipelineAmountMinor;
    snapshot.openDealCount += row.openDealCount;
    snapshot.rawValueAmountMinor += row.rawValueAmountMinor;
    snapshot.weightedValueAmountMinor += row.weightedValueAmountMinor;
    snapshots.set(key, snapshot);
  }

  return [...snapshots.values()];
}

export function deriveCrmSourceBreakdown(
  rows: readonly CrmSourceBreakdownRow[],
  input: CrmReportingBaseInput
): CrmSourceBreakdownReport {
  assertAuthorized(input, 'source');
  const groups = new Map<string, CrmSourceBreakdownGroup>();
  let excludedMissingCurrencyCount = 0;
  let excludedMissingValueCount = 0;

  for (const row of rows) {
    if (!row.currencyCode) {
      excludedMissingCurrencyCount += 1;
      continue;
    }
    if (row.valueAmountMinor == null) {
      excludedMissingValueCount += 1;
      continue;
    }
    const key = stableKey([
      row.source,
      row.utmSource,
      row.utmMedium,
      row.utmCampaign,
      row.currencyCode,
    ]);
    const group = groups.get(key) ?? {
      currencyCode: row.currencyCode,
      dealCount: 0,
      lostCount: 0,
      rawValueAmountMinor: 0,
      source: row.source ?? null,
      utmCampaign: row.utmCampaign ?? null,
      utmMedium: row.utmMedium ?? null,
      utmSource: row.utmSource ?? null,
      weightedValueAmountMinor: 0,
      winRateBps: 0,
      wonCount: 0,
    };
    group.dealCount += 1;
    group.rawValueAmountMinor += row.valueAmountMinor;
    group.weightedValueAmountMinor += roundHalfAwayFromZero(
      (row.valueAmountMinor * (row.stageProbability ?? 0)) / 100
    );
    if (row.outcome === 'won') group.wonCount += 1;
    if (row.outcome === 'lost') group.lostCount += 1;
    groups.set(key, group);
  }

  const output = [...groups.values()].map(group => ({
    ...group,
    winRateBps: toBasisPoints(group.wonCount, group.wonCount + group.lostCount),
  }));
  output.sort((left, right) =>
    stableKey([
      left.source,
      left.utmSource,
      left.utmMedium,
      left.utmCampaign,
      left.currencyCode,
    ]).localeCompare(
      stableKey([
        right.source,
        right.utmSource,
        right.utmMedium,
        right.utmCampaign,
        right.currencyCode,
      ])
    )
  );
  return {
    excludedMissingCurrencyCount,
    excludedMissingValueCount,
    groups: output,
    window: input.window,
  };
}

function groupValue(row: CrmWinRateRow, groupBy: CrmReportingGrouping): string {
  if (groupBy === 'agent') return row.agentId ?? 'unassigned';
  if (groupBy === 'branch') return row.branchId ?? 'unassigned';
  if (groupBy === 'pipeline') return row.pipelineId ?? 'unknown';
  if (groupBy === 'stage') return row.stageId ?? 'unknown';
  if (groupBy === 'loss_reason') return row.lossReasonId ?? 'none';
  return row.source ?? 'unknown';
}

export function deriveCrmWinRate(
  rows: readonly CrmWinRateRow[],
  input: CrmWinRateInput
): CrmWinRateReport {
  assertAuthorized(input, input.groupBy);
  const groups = new Map<string, CrmWinRateGroup>();
  for (const row of rows) {
    const key = groupValue(row, input.groupBy);
    const group = groups.get(key) ?? {
      groupKey: key,
      lostCount: 0,
      openCount: 0,
      winRateBps: 0,
      wonCount: 0,
    };
    if (row.outcome === 'won') group.wonCount += 1;
    else if (row.outcome === 'lost') group.lostCount += 1;
    else group.openCount += 1;
    groups.set(key, group);
  }
  return {
    groups: sortByKey(
      [...groups.values()].map(group => ({
        ...group,
        winRateBps: toBasisPoints(group.wonCount, group.wonCount + group.lostCount),
      }))
    ),
    window: input.window,
  };
}

export function deriveCrmAgentLeaderboard(
  rows: readonly CrmAgentLeaderboardRow[],
  input: CrmAgentLeaderboardInput
): CrmAgentLeaderboardReport {
  assertAuthorized(input, 'leaderboard');
  const minActivity = input.minActivity ?? 1;
  const groups = new Map<string, CrmAgentLeaderboardEntry>();

  for (const row of rows) {
    if (!row.agentId) continue;
    const key = stableKey([row.agentId, row.currencyCode]);
    const entry = groups.get(key) ?? {
      agentId: row.agentId,
      branchId: row.branchId ?? null,
      closedWonValueAmountMinor: 0,
      currencyCode: row.currencyCode ?? null,
      lostCount: 0,
      openPipelineValueAmountMinor: 0,
      rank: 0,
      totalDealCount: 0,
      weightedPipelineValueAmountMinor: 0,
      wonCount: 0,
    };
    entry.totalDealCount += 1;
    if (row.outcome === 'won' || row.isWonStage) {
      entry.wonCount += 1;
      entry.closedWonValueAmountMinor += row.valueAmountMinor ?? 0;
    } else if (row.outcome === 'lost' || row.isLostStage) {
      entry.lostCount += 1;
    } else {
      entry.openPipelineValueAmountMinor += row.valueAmountMinor ?? 0;
      entry.weightedPipelineValueAmountMinor += roundHalfAwayFromZero(
        ((row.valueAmountMinor ?? 0) * (row.stageProbability ?? 0)) / 100
      );
    }
    groups.set(key, entry);
  }

  let excludedInactiveAgentCount = 0;
  const entries = [...groups.values()].filter(entry => {
    if (entry.totalDealCount >= minActivity) return true;
    excludedInactiveAgentCount += 1;
    return false;
  });
  entries.sort((left, right) => {
    if (right.closedWonValueAmountMinor !== left.closedWonValueAmountMinor) {
      return right.closedWonValueAmountMinor - left.closedWonValueAmountMinor;
    }
    if (right.weightedPipelineValueAmountMinor !== left.weightedPipelineValueAmountMinor) {
      return right.weightedPipelineValueAmountMinor - left.weightedPipelineValueAmountMinor;
    }
    return left.agentId.localeCompare(right.agentId);
  });
  entries.slice(0, CRM_REPORTING_MAX_LEADERBOARD_ROWS).forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return {
    entries: entries.slice(0, CRM_REPORTING_MAX_LEADERBOARD_ROWS),
    excludedInactiveAgentCount,
    window: input.window,
  };
}
