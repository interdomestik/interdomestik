import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import {
  authorizeCrmReportingRead,
  CRM_REPORTING_MAX_WINDOW_DAYS,
  deriveCrmSourceBreakdown,
  deriveCrmWeightedPipeline,
  type CrmReportingAuthorizationDenialReason,
  type CrmReportingWindow,
  type CrmSourceBreakdownRow,
  type CrmWeightedPipelineRow,
} from '@interdomestik/domain-crm/reporting';
import type {
  CrmForecastSnapshotRepository,
  CrmPipelineSnapshotRecord,
  CrmReportingRepository,
} from '@interdomestik/domain-crm/reporting/repository';

import {
  crmForecastSnapshotRepository,
  crmReportingRepository,
} from '@/lib/domain-crm/reporting-repository';

import { getPreviousUtcSnapshotDate, type AdminCrmSnapshotFreshness } from './_core';

export const BRANCH_MANAGER_CRM_REPORTING_WINDOW_DAYS = 90;
export const BRANCH_MANAGER_CRM_REPORTING_SOURCE_TOP_N = 10;
export const BRANCH_MANAGER_CRM_REPORTING_MARKER_PREFIX = 'branch-manager-crm-reporting-';
export const BRANCH_MANAGER_CRM_SNAPSHOT_DELAYED_AFTER_HOURS = 24;
export const BRANCH_MANAGER_CRM_SNAPSHOT_STALE_AFTER_HOURS = 48;

export const BRANCH_MANAGER_CRM_REPORTING_ERROR_MESSAGE_BY_REASON: Record<
  CrmReportingAuthorizationDenialReason | 'repository_failure',
  string
> = {
  agent_scope: 'error.agent',
  branch_scope: 'error.branch',
  repository_failure: 'error.generic',
  role_scope: 'error.role',
  tenant_scope: 'error.tenant',
  unsupported_grouping: 'error.grouping',
  window_scope: 'error.window',
};

export const BRANCH_MANAGER_CRM_FORBIDDEN_PII_KEYS = [
  'email',
  'phone',
  'fullName',
  'name',
  'notes',
  'description',
  'subject',
  'bodyText',
  'bodyHtml',
  'activityText',
  'dealName',
] as const;

export interface BranchManagerCrmSnapshotRow {
  snapshotDate: string;
  snapshotVersion: number;
  branchId: string;
  branchLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  currencyCode: string;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
  openDealCount: number;
  closedWonAmountMinor: number;
  closedLostAmountMinor: number;
  freshness: AdminCrmSnapshotFreshness;
}

export interface BranchManagerCrmPipelineRow {
  branchId: string;
  branchLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  currencyCode: string;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
  openDealCount: number;
  excludedInconsistentForecastCount: number;
}

export interface BranchManagerCrmSourceBreakdownRow {
  branchId: string;
  branchLabel: string;
  sourceLabel: string;
  currencyCode: string;
  dealCount: number;
  totalAmountMinor: number;
  weightedAmountMinor: number;
  excludedInconsistentForecastCount: number;
}

export type BranchManagerCrmWidget<T> =
  | { state: 'data'; rows: T[]; excludedRowCount: number }
  | { state: 'empty'; rows: []; excludedRowCount: number }
  | { state: 'error'; rows: []; excludedRowCount: 0; messageKey: string };

export type BranchManagerCrmReportingDashboard = {
  branchLabel: string;
  branchPipeline: BranchManagerCrmWidget<BranchManagerCrmPipelineRow>;
  generatedAt: string;
  snapshot: BranchManagerCrmWidget<BranchManagerCrmSnapshotRow>;
  snapshotDate: string;
  sourceBreakdown: BranchManagerCrmWidget<BranchManagerCrmSourceBreakdownRow>;
  window: CrmReportingWindow;
};

export class BranchManagerCrmReportingAccessDeniedError extends Error {
  constructor(readonly reason: CrmReportingAuthorizationDenialReason) {
    super(`Branch-manager CRM reporting read denied: ${reason}`);
    this.name = 'BranchManagerCrmReportingAccessDeniedError';
  }
}

type BranchManagerCrmReportingCoreOptions = {
  branchLabel?: string | null;
  forecastSnapshotRepository?: CrmForecastSnapshotRepository;
  logger?: Pick<Console, 'error'>;
  now?: () => string;
  reportingRepository?: CrmReportingRepository;
};

export function createBranchManagerCrmReportingWindow(nowIso: string): CrmReportingWindow {
  const to = new Date(nowIso);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - BRANCH_MANAGER_CRM_REPORTING_WINDOW_DAYS);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function deriveBranchManagerCrmSnapshotFreshness(
  snapshotDate: string | null,
  nowIso: string
): AdminCrmSnapshotFreshness {
  if (!snapshotDate) return 'missing';
  const [year, month, day] = snapshotDate.split('-').map(Number);
  if (!year || !month || !day) return 'stale';
  const snapshotEnd = Date.UTC(year, month - 1, day + 1) - 1;
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return 'stale';
  const ageHours = (now - snapshotEnd) / (60 * 60 * 1000);
  if (ageHours < BRANCH_MANAGER_CRM_SNAPSHOT_DELAYED_AFTER_HOURS) return 'fresh';
  if (ageHours < BRANCH_MANAGER_CRM_SNAPSHOT_STALE_AFTER_HOURS) return 'delayed';
  return 'stale';
}

function branchIdFor(actor: CrmActorContext): string {
  const branchId = actor.scope.branchId;
  if (!branchId) throw new BranchManagerCrmReportingAccessDeniedError('branch_scope');
  return branchId;
}

function branchLabelFor(branchId: string, label?: string | null): string {
  return label?.trim() || branchId;
}

function pipelineLabel(pipelineId: string): string {
  return pipelineId;
}

function sourceLabel(row: { source: string | null; utmSource: string | null }): string {
  return row.source ?? row.utmSource ?? 'unknown';
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

function toWidget<T>(rows: T[], excludedRowCount = 0): BranchManagerCrmWidget<T> {
  return rows.length > 0
    ? { excludedRowCount, rows, state: 'data' }
    : { excludedRowCount, rows: [], state: 'empty' };
}

function toErrorWidget<T>(
  reason: CrmReportingAuthorizationDenialReason | 'repository_failure'
): BranchManagerCrmWidget<T> {
  return {
    excludedRowCount: 0,
    messageKey: BRANCH_MANAGER_CRM_REPORTING_ERROR_MESSAGE_BY_REASON[reason],
    rows: [],
    state: 'error',
  };
}

function denialReasonFromError(error: unknown): CrmReportingAuthorizationDenialReason | null {
  if (!(error instanceof Error) || !error.message.includes('CRM reporting read denied:')) {
    return null;
  }
  const reason = error.message.split(':').at(-1)?.trim();
  if (reason && reason in BRANCH_MANAGER_CRM_REPORTING_ERROR_MESSAGE_BY_REASON) {
    return reason as CrmReportingAuthorizationDenialReason;
  }
  return null;
}

function filterWeightedRowsToBranch(
  rows: readonly CrmWeightedPipelineRow[],
  branchId: string
): CrmWeightedPipelineRow[] {
  return rows.filter(row => row.branchId === branchId);
}

function filterSourceRowsToBranch(
  rows: readonly CrmSourceBreakdownRow[],
  branchId: string
): CrmSourceBreakdownRow[] {
  return rows.filter(row => row.branchId === branchId);
}

function mapSnapshotRows(
  rows: readonly CrmPipelineSnapshotRecord[],
  args: { branchId: string; branchLabel: string; nowIso: string }
): BranchManagerCrmSnapshotRow[] {
  return rows
    .filter(row => row.branchId === args.branchId)
    .map(row => ({
      branchId: args.branchId,
      branchLabel: args.branchLabel,
      closedLostAmountMinor: row.closedLostAmountMinor,
      closedWonAmountMinor: row.closedWonAmountMinor,
      currencyCode: row.currencyCode,
      freshness: deriveBranchManagerCrmSnapshotFreshness(row.snapshotDate, args.nowIso),
      openDealCount: row.openDealCount,
      pipelineId: row.pipelineId,
      pipelineLabel: pipelineLabel(row.pipelineId),
      snapshotDate: row.snapshotDate,
      snapshotVersion: row.snapshotVersion,
      totalPipelineAmountMinor: row.rawValueAmountMinor,
      weightedPipelineAmountMinor: row.weightedValueAmountMinor,
    }))
    .sort((left, right) => {
      const byCurrency = left.currencyCode.localeCompare(right.currencyCode);
      if (byCurrency !== 0) return byCurrency;
      return left.pipelineLabel.localeCompare(right.pipelineLabel);
    });
}

async function readSnapshotWidget(args: {
  actor: CrmActorContext;
  branchId: string;
  branchLabel: string;
  nowIso: string;
  repository: CrmForecastSnapshotRepository;
  snapshotDate: string;
}): Promise<BranchManagerCrmWidget<BranchManagerCrmSnapshotRow>> {
  const rows = await args.repository.listLatestPipelineSnapshots({
    branchId: args.branchId,
    snapshotDate: args.snapshotDate,
    tenantId: args.actor.tenantId,
  });
  return toWidget(mapSnapshotRows(rows, args));
}

async function readBranchPipelineWidget(args: {
  actor: CrmActorContext;
  branchId: string;
  branchLabel: string;
  repository: CrmReportingRepository;
  window: CrmReportingWindow;
}): Promise<BranchManagerCrmWidget<BranchManagerCrmPipelineRow>> {
  const input = { actor: args.actor, window: args.window };
  const rows = filterWeightedRowsToBranch(
    await args.repository.listWeightedPipelineRows(input),
    args.branchId
  );
  const report = deriveCrmWeightedPipeline(rows, { ...input, groupBy: ['branch', 'pipeline'] });
  const mapped = report.groups
    .filter(group => group.branchId === args.branchId)
    .map(group => ({
      branchId: args.branchId,
      branchLabel: args.branchLabel,
      currencyCode: group.currencyCode,
      excludedInconsistentForecastCount: report.excludedInconsistentForecastCount,
      openDealCount: group.openDealCount,
      pipelineId: group.pipelineId,
      pipelineLabel: pipelineLabel(group.pipelineId),
      totalPipelineAmountMinor: group.rawValueAmountMinor,
      weightedPipelineAmountMinor: group.weightedValueAmountMinor,
    }))
    .sort((left, right) => {
      const byPipeline = left.pipelineLabel.localeCompare(right.pipelineLabel);
      if (byPipeline !== 0) return byPipeline;
      return left.currencyCode.localeCompare(right.currencyCode);
    });
  return toWidget(mapped, countWeightedExclusions(report));
}

async function readSourceBreakdownWidget(args: {
  actor: CrmActorContext;
  branchId: string;
  branchLabel: string;
  repository: CrmReportingRepository;
  window: CrmReportingWindow;
}): Promise<BranchManagerCrmWidget<BranchManagerCrmSourceBreakdownRow>> {
  const input = { actor: args.actor, window: args.window };
  const rows = filterSourceRowsToBranch(
    await args.repository.listSourceBreakdownRows(input),
    args.branchId
  );
  const report = deriveCrmSourceBreakdown(rows, input);
  const excludedRowCount = report.excludedMissingCurrencyCount + report.excludedMissingValueCount;
  const mapped = report.groups
    .map(group => ({
      branchId: args.branchId,
      branchLabel: args.branchLabel,
      currencyCode: group.currencyCode,
      dealCount: group.dealCount,
      excludedInconsistentForecastCount: 0,
      sourceLabel: sourceLabel(group),
      totalAmountMinor: group.rawValueAmountMinor,
      weightedAmountMinor: group.weightedValueAmountMinor,
    }))
    .sort((left, right) => {
      if (right.dealCount !== left.dealCount) return right.dealCount - left.dealCount;
      if (right.totalAmountMinor !== left.totalAmountMinor) {
        return right.totalAmountMinor - left.totalAmountMinor;
      }
      const bySource = left.sourceLabel.localeCompare(right.sourceLabel);
      if (bySource !== 0) return bySource;
      return left.currencyCode.localeCompare(right.currencyCode);
    })
    .slice(0, BRANCH_MANAGER_CRM_REPORTING_SOURCE_TOP_N);
  return toWidget(mapped, excludedRowCount);
}

async function settleWidget<T>(
  promise: Promise<BranchManagerCrmWidget<T>>,
  logger: Pick<Console, 'error'>,
  label: string
): Promise<BranchManagerCrmWidget<T>> {
  try {
    return await promise;
  } catch (error) {
    const denialReason = denialReasonFromError(error);
    if (denialReason) return toErrorWidget(denialReason);
    logger.error(`[BranchManagerCrmReporting] ${label} failed`, error);
    return toErrorWidget('repository_failure');
  }
}

export async function getBranchManagerCrmReportingCore(
  args: { actor: CrmActorContext },
  options: BranchManagerCrmReportingCoreOptions = {}
): Promise<BranchManagerCrmReportingDashboard> {
  if (!args.actor.tenantId) {
    throw new BranchManagerCrmReportingAccessDeniedError('tenant_scope');
  }
  if (args.actor.role !== 'branch_manager') {
    throw new BranchManagerCrmReportingAccessDeniedError('role_scope');
  }

  const branchId = branchIdFor(args.actor);
  const branchLabel = branchLabelFor(branchId, options.branchLabel);
  const nowIso = (options.now ?? (() => new Date().toISOString()))();
  const window = createBranchManagerCrmReportingWindow(nowIso);
  if (BRANCH_MANAGER_CRM_REPORTING_WINDOW_DAYS > CRM_REPORTING_MAX_WINDOW_DAYS) {
    throw new BranchManagerCrmReportingAccessDeniedError('window_scope');
  }
  const denied = authorizeCrmReportingRead({ actor: args.actor, grouping: 'pipeline', window });
  if (denied) {
    throw new BranchManagerCrmReportingAccessDeniedError(denied);
  }

  const reportingRepository = options.reportingRepository ?? crmReportingRepository;
  const forecastSnapshotRepository =
    options.forecastSnapshotRepository ?? crmForecastSnapshotRepository;
  const logger = options.logger ?? console;
  const snapshotDate = getPreviousUtcSnapshotDate(nowIso);

  const [snapshot, branchPipeline, sourceBreakdown] = await Promise.all([
    settleWidget(
      readSnapshotWidget({
        actor: args.actor,
        branchId,
        branchLabel,
        nowIso,
        repository: forecastSnapshotRepository,
        snapshotDate,
      }),
      logger,
      'snapshot'
    ),
    settleWidget(
      readBranchPipelineWidget({
        actor: args.actor,
        branchId,
        branchLabel,
        repository: reportingRepository,
        window,
      }),
      logger,
      'branchPipeline'
    ),
    settleWidget(
      readSourceBreakdownWidget({
        actor: args.actor,
        branchId,
        branchLabel,
        repository: reportingRepository,
        window,
      }),
      logger,
      'sourceBreakdown'
    ),
  ]);

  return {
    branchLabel,
    branchPipeline,
    generatedAt: nowIso,
    snapshot,
    snapshotDate,
    sourceBreakdown,
    window,
  };
}
