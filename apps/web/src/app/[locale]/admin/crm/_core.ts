import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import {
  authorizeCrmReportingRead,
  CRM_REPORTING_MAX_WINDOW_DAYS,
  deriveCrmSourceBreakdown,
  deriveCrmWeightedPipeline,
  type CrmReportingAuthorizationDenialReason,
  type CrmReportingWindow,
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

export const ADMIN_CRM_REPORTING_WINDOW_DAYS = 90;
export const ADMIN_CRM_REPORTING_SOURCE_TOP_N = 10;
export const ADMIN_CRM_REPORTING_MARKER_PREFIX = 'admin-crm-reporting-';
export const ADMIN_CRM_SNAPSHOT_DELAYED_AFTER_HOURS = 24;
export const ADMIN_CRM_SNAPSHOT_STALE_AFTER_HOURS = 48;

export const ADMIN_CRM_REPORTING_ERROR_MESSAGE_BY_REASON: Record<
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

export const ADMIN_CRM_FORBIDDEN_PII_KEYS = [
  'email',
  'phone',
  'fullName',
  'name',
  'notes',
  'description',
  'subject',
  'bodyText',
  'bodyHtml',
] as const;

export type AdminCrmSnapshotFreshness = 'fresh' | 'delayed' | 'stale' | 'missing';

export interface AdminCrmLatestSnapshotRow {
  snapshotDate: string;
  snapshotVersion: number;
  pipelineId: string;
  branchId: string | null;
  currencyCode: string;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
  openDealCount: number;
  closedWonAmountMinor: number;
  closedLostAmountMinor: number;
  freshness: AdminCrmSnapshotFreshness;
}

export interface AdminCrmBranchPipelineRow {
  branchId: string | null;
  branchLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  currencyCode: string;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
  openDealCount: number;
  excludedInconsistentForecastCount: number;
}

export interface AdminCrmSourceBreakdownRow {
  sourceLabel: string;
  currencyCode: string;
  dealCount: number;
  totalAmountMinor: number;
  weightedAmountMinor: number;
  excludedInconsistentForecastCount: number;
}

export type AdminCrmWidget<T> =
  | { state: 'data'; rows: T[]; excludedRowCount: number }
  | { state: 'empty'; rows: []; excludedRowCount: number }
  | { state: 'error'; rows: []; excludedRowCount: 0; messageKey: string };

export type AdminCrmReportingDashboard = {
  branchPipeline: AdminCrmWidget<AdminCrmBranchPipelineRow>;
  generatedAt: string;
  snapshot: AdminCrmWidget<AdminCrmLatestSnapshotRow>;
  snapshotDate: string;
  sourceBreakdown: AdminCrmWidget<AdminCrmSourceBreakdownRow>;
  window: CrmReportingWindow;
};

export class AdminCrmReportingAccessDeniedError extends Error {
  constructor(readonly reason: CrmReportingAuthorizationDenialReason) {
    super(`Admin CRM reporting read denied: ${reason}`);
    this.name = 'AdminCrmReportingAccessDeniedError';
  }
}

type AdminCrmReportingCoreOptions = {
  forecastSnapshotRepository?: CrmForecastSnapshotRepository;
  logger?: Pick<Console, 'error'>;
  now?: () => string;
  reportingRepository?: CrmReportingRepository;
};

export function createAdminCrmReportingWindow(nowIso: string): CrmReportingWindow {
  const to = new Date(nowIso);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - ADMIN_CRM_REPORTING_WINDOW_DAYS);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function getPreviousUtcSnapshotDate(nowIso: string): string {
  const now = new Date(nowIso);
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

export function deriveAdminCrmSnapshotFreshness(
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
  if (ageHours < ADMIN_CRM_SNAPSHOT_DELAYED_AFTER_HOURS) return 'fresh';
  if (ageHours < ADMIN_CRM_SNAPSHOT_STALE_AFTER_HOURS) return 'delayed';
  return 'stale';
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

function sourceLabel(row: { source: string | null; utmSource: string | null }): string {
  return row.source ?? row.utmSource ?? 'unknown';
}

function toWidget<T>(rows: T[], excludedRowCount = 0): AdminCrmWidget<T> {
  return rows.length > 0
    ? { excludedRowCount, rows, state: 'data' }
    : { excludedRowCount, rows: [], state: 'empty' };
}

function toErrorWidget<T>(
  reason: CrmReportingAuthorizationDenialReason | 'repository_failure'
): AdminCrmWidget<T> {
  return {
    excludedRowCount: 0,
    messageKey: ADMIN_CRM_REPORTING_ERROR_MESSAGE_BY_REASON[reason],
    rows: [],
    state: 'error',
  };
}

function branchLabel(branchId: string | null): string {
  return branchId ?? 'tenant';
}

function pipelineLabel(pipelineId: string): string {
  return pipelineId;
}

function mapSnapshotRows(
  rows: readonly CrmPipelineSnapshotRecord[],
  nowIso: string
): AdminCrmLatestSnapshotRow[] {
  return rows
    .map(row => ({
      branchId: row.branchId ?? null,
      closedLostAmountMinor: row.closedLostAmountMinor,
      closedWonAmountMinor: row.closedWonAmountMinor,
      currencyCode: row.currencyCode,
      freshness: deriveAdminCrmSnapshotFreshness(row.snapshotDate, nowIso),
      openDealCount: row.openDealCount,
      pipelineId: row.pipelineId,
      snapshotDate: row.snapshotDate,
      snapshotVersion: row.snapshotVersion,
      totalPipelineAmountMinor: row.rawValueAmountMinor,
      weightedPipelineAmountMinor: row.weightedValueAmountMinor,
    }))
    .sort((left, right) => {
      const byCurrency = left.currencyCode.localeCompare(right.currencyCode);
      if (byCurrency !== 0) return byCurrency;
      const byPipeline = left.pipelineId.localeCompare(right.pipelineId);
      if (byPipeline !== 0) return byPipeline;
      return (left.branchId ?? '').localeCompare(right.branchId ?? '');
    });
}

async function readSnapshotWidget(args: {
  actor: CrmActorContext;
  nowIso: string;
  repository: CrmForecastSnapshotRepository;
  snapshotDate: string;
}): Promise<AdminCrmWidget<AdminCrmLatestSnapshotRow>> {
  const rows = await args.repository.listLatestPipelineSnapshots({
    snapshotDate: args.snapshotDate,
    tenantId: args.actor.tenantId,
  });
  return toWidget(mapSnapshotRows(rows, args.nowIso));
}

async function readBranchPipelineWidget(args: {
  actor: CrmActorContext;
  repository: CrmReportingRepository;
  window: CrmReportingWindow;
}): Promise<AdminCrmWidget<AdminCrmBranchPipelineRow>> {
  const input = { actor: args.actor, window: args.window };
  const rows = await args.repository.listWeightedPipelineRows(input);
  const report = deriveCrmWeightedPipeline(rows, { ...input, groupBy: ['branch', 'pipeline'] });
  const mapped = report.groups
    .map(group => ({
      branchId: group.branchId ?? null,
      branchLabel: branchLabel(group.branchId ?? null),
      currencyCode: group.currencyCode,
      excludedInconsistentForecastCount: report.excludedInconsistentForecastCount,
      openDealCount: group.openDealCount,
      pipelineId: group.pipelineId,
      pipelineLabel: pipelineLabel(group.pipelineId),
      totalPipelineAmountMinor: group.rawValueAmountMinor,
      weightedPipelineAmountMinor: group.weightedValueAmountMinor,
    }))
    .sort((left, right) => {
      const byBranch = left.branchLabel.localeCompare(right.branchLabel);
      if (byBranch !== 0) return byBranch;
      const byPipeline = left.pipelineLabel.localeCompare(right.pipelineLabel);
      if (byPipeline !== 0) return byPipeline;
      return left.currencyCode.localeCompare(right.currencyCode);
    });
  return toWidget(mapped, countWeightedExclusions(report));
}

async function readSourceBreakdownWidget(args: {
  actor: CrmActorContext;
  repository: CrmReportingRepository;
  window: CrmReportingWindow;
}): Promise<AdminCrmWidget<AdminCrmSourceBreakdownRow>> {
  const input = { actor: args.actor, window: args.window };
  const rows = await args.repository.listSourceBreakdownRows(input);
  const report = deriveCrmSourceBreakdown(rows, input);
  const excludedRowCount = report.excludedMissingCurrencyCount + report.excludedMissingValueCount;
  const mapped = report.groups
    .map(group => ({
      currencyCode: group.currencyCode,
      dealCount: group.dealCount,
      excludedInconsistentForecastCount: 0,
      sourceLabel: sourceLabel(group),
      totalAmountMinor: group.rawValueAmountMinor,
      weightedAmountMinor: group.weightedValueAmountMinor,
    }))
    .sort((left, right) => {
      if (right.dealCount !== left.dealCount) return right.dealCount - left.dealCount;
      const bySource = left.sourceLabel.localeCompare(right.sourceLabel);
      if (bySource !== 0) return bySource;
      return left.currencyCode.localeCompare(right.currencyCode);
    })
    .slice(0, ADMIN_CRM_REPORTING_SOURCE_TOP_N);
  return toWidget(mapped, excludedRowCount);
}

async function settleWidget<T>(
  promise: Promise<AdminCrmWidget<T>>,
  logger: Pick<Console, 'error'>,
  label: string
): Promise<AdminCrmWidget<T>> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof Error && error.message.includes('CRM reporting read denied:')) {
      const reason = error.message.split(':').at(-1)?.trim();
      if (reason && reason in ADMIN_CRM_REPORTING_ERROR_MESSAGE_BY_REASON) {
        return toErrorWidget(reason as CrmReportingAuthorizationDenialReason);
      }
    }
    logger.error(`[AdminCrmReporting] ${label} failed`, error);
    return toErrorWidget('repository_failure');
  }
}

export async function getAdminCrmReportingCore(
  args: { actor: CrmActorContext },
  options: AdminCrmReportingCoreOptions = {}
): Promise<AdminCrmReportingDashboard> {
  if (!args.actor.tenantId) {
    throw new AdminCrmReportingAccessDeniedError('tenant_scope');
  }
  if (args.actor.role !== 'admin') {
    throw new AdminCrmReportingAccessDeniedError('role_scope');
  }

  const nowIso = (options.now ?? (() => new Date().toISOString()))();
  const window = createAdminCrmReportingWindow(nowIso);
  if (ADMIN_CRM_REPORTING_WINDOW_DAYS > CRM_REPORTING_MAX_WINDOW_DAYS) {
    throw new AdminCrmReportingAccessDeniedError('window_scope');
  }
  const denied = authorizeCrmReportingRead({
    actor: args.actor,
    grouping: 'source',
    window,
  });
  if (denied) {
    throw new AdminCrmReportingAccessDeniedError(denied);
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
        nowIso,
        repository: forecastSnapshotRepository,
        snapshotDate,
      }),
      logger,
      'snapshot'
    ),
    settleWidget(
      readBranchPipelineWidget({ actor: args.actor, repository: reportingRepository, window }),
      logger,
      'branchPipeline'
    ),
    settleWidget(
      readSourceBreakdownWidget({ actor: args.actor, repository: reportingRepository, window }),
      logger,
      'sourceBreakdown'
    ),
  ]);

  return {
    branchPipeline,
    generatedAt: nowIso,
    snapshot,
    snapshotDate,
    sourceBreakdown,
    window,
  };
}
