import type { CrmActorContext } from '../context';
import type { CrmDealForecastCategory } from '../deals/types';

export const CRM_REPORTING_MAX_WINDOW_DAYS = 400;
export const CRM_REPORTING_DURATION_DECIMAL_PLACES = 2;
export const CRM_REPORTING_PERCENT_DENOMINATOR = 10000;
export const CRM_REPORTING_MAX_GROUP_ROWS = 250;
export const CRM_REPORTING_MAX_LEADERBOARD_ROWS = 100;

export type CrmReportingAuthorizationDenialReason =
  | 'tenant_scope'
  | 'role_scope'
  | 'branch_scope'
  | 'agent_scope'
  | 'window_scope'
  | 'unsupported_grouping';

export type CrmReportingWindow = {
  from: string;
  to: string;
};

export type CrmReportingGrouping =
  | 'agent'
  | 'branch'
  | 'source'
  | 'pipeline'
  | 'stage'
  | 'loss_reason';

export type CrmReportingBaseInput = {
  actor: CrmActorContext;
  includeArchived?: boolean;
  window: CrmReportingWindow;
};

export type CrmReportingResult<T> =
  | { success: true; report: T }
  | { success: false; error: 'forbidden'; reason: CrmReportingAuthorizationDenialReason }
  | { success: false; error: 'invalid_input'; reason: CrmReportingAuthorizationDenialReason };

export type CrmReportingStageHistoryKind =
  | 'created'
  | 'stage_changed'
  | 'won'
  | 'lost'
  | 'reopened';

export type CrmFunnelConversionInput = CrmReportingBaseInput & {
  mode?: 'period_entry';
};

export type CrmFunnelConversionRow = {
  branchId?: string | null;
  dealId: string;
  enteredAt: string;
  exitedAt?: string | null;
  kind: CrmReportingStageHistoryKind;
  lossReasonId?: string | null;
  pipelineId: string;
  stageId: string;
  stageIsLost?: boolean;
  stageIsWon?: boolean;
  tenantId: string;
};

export type CrmFunnelConversionStage = {
  conversionRateBps: number;
  dropOffRateBps: number;
  enteredCount: number;
  exitedCount: number;
  lostCount: number;
  pipelineId: string;
  stageId: string;
  wonCount: number;
};

export type CrmFunnelConversionReport = {
  excludedArchivedCount: number;
  stages: CrmFunnelConversionStage[];
  window: CrmReportingWindow;
};

export type CrmStageVelocityInput = CrmReportingBaseInput & {
  includeOpenIntervals?: boolean;
  now?: string;
};

export type CrmStageVelocityRow = {
  branchId?: string | null;
  dealId: string;
  enteredAt: string;
  exitedAt?: string | null;
  kind: CrmReportingStageHistoryKind;
  pipelineId: string;
  stageId: string;
  tenantId: string;
};

export type CrmStageVelocityStage = {
  averageDays: number;
  maximumDays: number;
  medianDays: number;
  minimumDays: number;
  pipelineId: string;
  sampleCount: number;
  stageId: string;
};

export type CrmStageVelocityReport = {
  excludedOpenIntervalCount: number;
  stages: CrmStageVelocityStage[];
  window: CrmReportingWindow;
};

export type CrmWeightedPipelineInput = CrmReportingBaseInput & {
  groupBy?: readonly CrmReportingGrouping[];
};

export type CrmWeightedPipelineRow = {
  agentId?: string | null;
  archivedAt?: string | null;
  branchId?: string | null;
  currencyCode?: string | null;
  currentStageId?: string | null;
  dealId: string;
  forecastCategory?: CrmDealForecastCategory | null;
  isLostStage?: boolean;
  isWonStage?: boolean;
  lossReasonId?: string | null;
  pipelineId?: string | null;
  source?: string | null;
  stageProbability?: number | null;
  tenantId: string;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  utmSource?: string | null;
  valueAmountMinor?: number | null;
};

export type CrmWeightedPipelineGroup = {
  agentId?: string | null;
  branchId?: string | null;
  closedLostAmountMinor: number;
  closedWonAmountMinor: number;
  currencyCode: string;
  forecastBestAmountMinor: number;
  forecastCommitAmountMinor: number;
  forecastOmittedAmountMinor: number;
  forecastPipelineAmountMinor: number;
  openDealCount: number;
  pipelineId: string;
  rawValueAmountMinor: number;
  stageId?: string | null;
  tenantId: string;
  weightedValueAmountMinor: number;
};

export type CrmWeightedPipelineReport = {
  excludedArchivedCount: number;
  excludedInconsistentForecastCount: number;
  excludedMissingCurrencyCount: number;
  excludedMissingPipelineCount: number;
  excludedMissingStageCount: number;
  excludedMissingValueCount: number;
  groups: CrmWeightedPipelineGroup[];
  window: CrmReportingWindow;
};

export type CrmForecastSnapshotInput = {
  createdAt: string;
  createdById?: string | null;
  idempotencyKey?: string | null;
  snapshotDate: string;
  sourceRunId?: string | null;
};

export type CrmForecastSnapshotRow = {
  branchId?: string | null;
  closedLostAmountMinor: number;
  closedWonAmountMinor: number;
  createdAt: string;
  createdById?: string | null;
  currencyCode: string;
  forecastBestAmountMinor: number;
  forecastCommitAmountMinor: number;
  forecastOmittedAmountMinor: number;
  forecastPipelineAmountMinor: number;
  idempotencyKey?: string | null;
  openDealCount: number;
  pipelineId: string;
  rawValueAmountMinor: number;
  snapshotDate: string;
  sourceRunId?: string | null;
  tenantId: string;
  weightedValueAmountMinor: number;
};

export type CrmSourceBreakdownRow = CrmWeightedPipelineRow & {
  outcome?: 'open' | 'won' | 'lost';
};

export type CrmSourceBreakdownGroup = {
  currencyCode: string;
  dealCount: number;
  lostCount: number;
  rawValueAmountMinor: number;
  source: string | null;
  utmCampaign: string | null;
  utmMedium: string | null;
  utmSource: string | null;
  weightedValueAmountMinor: number;
  winRateBps: number;
  wonCount: number;
};

export type CrmSourceBreakdownReport = {
  excludedMissingCurrencyCount: number;
  excludedMissingValueCount: number;
  groups: CrmSourceBreakdownGroup[];
  window: CrmReportingWindow;
};

export type CrmWinRateInput = CrmReportingBaseInput & {
  groupBy: CrmReportingGrouping;
};

export type CrmWinRateRow = {
  agentId?: string | null;
  branchId?: string | null;
  lossReasonId?: string | null;
  outcome: 'open' | 'won' | 'lost';
  pipelineId?: string | null;
  source?: string | null;
  stageId?: string | null;
  tenantId: string;
};

export type CrmWinRateGroup = {
  groupKey: string;
  lostCount: number;
  openCount: number;
  winRateBps: number;
  wonCount: number;
};

export type CrmWinRateReport = {
  groups: CrmWinRateGroup[];
  window: CrmReportingWindow;
};

export type CrmAgentLeaderboardInput = CrmReportingBaseInput & {
  minActivity?: number;
};

export type CrmAgentLeaderboardRow = CrmWeightedPipelineRow & {
  activityCount?: number;
  outcome?: 'open' | 'won' | 'lost';
};

export type CrmAgentLeaderboardEntry = {
  agentId: string;
  branchId: string | null;
  closedWonValueAmountMinor: number;
  currencyCode: string | null;
  lostCount: number;
  openPipelineValueAmountMinor: number;
  rank: number;
  totalDealCount: number;
  weightedPipelineValueAmountMinor: number;
  wonCount: number;
};

export type CrmAgentLeaderboardReport = {
  entries: CrmAgentLeaderboardEntry[];
  excludedInactiveAgentCount: number;
  window: CrmReportingWindow;
};
