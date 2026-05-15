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
import {
  crmForecastSnapshotObservabilityRepository,
  type CrmForecastSnapshotObservabilityRepository,
  type CrmForecastSnapshotObservedRow,
} from '@/lib/domain-crm/forecast-snapshot-observability';
import {
  CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN,
  crmForecastSnapshotWorkItemRepository,
  type CrmForecastSnapshotWorkItem,
  type CrmForecastSnapshotWorkItemRepository,
} from '@/lib/domain-crm/forecast-snapshot-work-items';

export const ADMIN_CRM_REPORTING_WINDOW_DAYS = 90;
export const ADMIN_CRM_REPORTING_SOURCE_TOP_N = 10;
export const ADMIN_CRM_REPORTING_MARKER_PREFIX = 'admin-crm-reporting-';
export const ADMIN_CRM_SNAPSHOT_DELAYED_AFTER_HOURS = 24;
export const ADMIN_CRM_SNAPSHOT_STALE_AFTER_HOURS = 48;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_WINDOW_DAYS = 1;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_COVERAGE_ROWS = 100;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_BATCH_ROWS = 10;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_DELAYED_AFTER_HOURS = 30;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_STALE_AFTER_HOURS = 48;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_MARKER_PREFIX = 'admin-crm-forecast-observability-';
export const ADMIN_CRM_FORECAST_OBSERVABILITY_SUMMARY_MARKER = `${ADMIN_CRM_FORECAST_OBSERVABILITY_MARKER_PREFIX}summary`;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_COVERAGE_MARKER = `${ADMIN_CRM_FORECAST_OBSERVABILITY_MARKER_PREFIX}coverage`;
export const ADMIN_CRM_FORECAST_OBSERVABILITY_BATCHES_MARKER = `${ADMIN_CRM_FORECAST_OBSERVABILITY_MARKER_PREFIX}batches`;

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

export type AdminCrmForecastObservabilityStatus = 'fresh' | 'delayed' | 'stale' | 'missing';

export interface AdminCrmForecastObservabilitySummary {
  snapshotDate: string;
  generatedAt: string;
  expectedWorkItems: number;
  expectedWorkItemsDeferred: number;
  observedWorkItems: number;
  missingWorkItems: number;
  delayedWorkItems: number;
  staleWorkItems: number;
  unexpectedObservedWorkItems: number;
  latestSnapshotCreatedAt: string | null;
  latestSourceRunId: string | null;
}

export interface AdminCrmForecastObservabilityCoverageRow {
  branchId: string | null;
  branchLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  currencyCode: string;
  snapshotDate: string;
  snapshotVersion: number | null;
  latestSnapshotCreatedAt: string | null;
  sourceRunId: string | null;
  status: AdminCrmForecastObservabilityStatus;
}

export interface AdminCrmForecastObservabilityBatchRow {
  sourceRunId: string | null;
  snapshotDate: string;
  firstSnapshotCreatedAt: string;
  lastSnapshotCreatedAt: string;
  observedWorkItems: number;
  branchCount: number;
  pipelineCount: number;
  currencyCount: number;
}

export type AdminCrmWidget<T> =
  | { state: 'data'; rows: T[]; excludedRowCount: number }
  | { state: 'empty'; rows: []; excludedRowCount: number }
  | { state: 'error'; rows: []; excludedRowCount: 0; messageKey: string };

export type AdminCrmForecastObservabilityWidget =
  | {
      state: 'data';
      summary: AdminCrmForecastObservabilitySummary;
      coverageRows: AdminCrmForecastObservabilityCoverageRow[];
      batchRows: AdminCrmForecastObservabilityBatchRow[];
      hiddenCoverageRowCount: number;
    }
  | {
      state: 'empty';
      summary: AdminCrmForecastObservabilitySummary;
      coverageRows: [];
      batchRows: [];
      hiddenCoverageRowCount: 0;
    }
  | {
      state: 'error';
      summary: null;
      coverageRows: [];
      batchRows: [];
      hiddenCoverageRowCount: 0;
      messageKey: string;
    };

export type AdminCrmReportingDashboard = {
  branchPipeline: AdminCrmWidget<AdminCrmBranchPipelineRow>;
  forecastObservability: AdminCrmForecastObservabilityWidget;
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
  forecastSnapshotObservabilityRepository?: CrmForecastSnapshotObservabilityRepository;
  forecastSnapshotWorkItemRepository?: CrmForecastSnapshotWorkItemRepository;
  labels?: {
    noBranch?: string;
  };
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

function snapshotDateRange(snapshotDate: string): {
  snapshotDateEndExclusive: Date;
  snapshotDateStartInclusive: Date;
} {
  const snapshotDateStartInclusive = new Date(`${snapshotDate}T00:00:00.000Z`);
  const snapshotDateEndExclusive = new Date(snapshotDateStartInclusive);
  snapshotDateEndExclusive.setUTCDate(
    snapshotDateEndExclusive.getUTCDate() + ADMIN_CRM_FORECAST_OBSERVABILITY_WINDOW_DAYS
  );
  return { snapshotDateEndExclusive, snapshotDateStartInclusive };
}

function workItemKey(input: {
  branchId?: string | null;
  currencyCode: string;
  pipelineId: string;
  tenantId: string;
}): string {
  return [input.tenantId, input.pipelineId, input.branchId ?? '', input.currencyCode].join(
    '\u001f'
  );
}

function deriveAdminCrmForecastObservabilityStatus(
  latestSnapshotCreatedAt: string,
  generatedAt: string
): AdminCrmForecastObservabilityStatus {
  const generated = Date.parse(generatedAt);
  const latest = Date.parse(latestSnapshotCreatedAt);
  if (!Number.isFinite(generated) || !Number.isFinite(latest)) return 'stale';
  const ageHours = (generated - latest) / (60 * 60 * 1000);
  if (ageHours >= ADMIN_CRM_FORECAST_OBSERVABILITY_STALE_AFTER_HOURS) return 'stale';
  if (ageHours >= ADMIN_CRM_FORECAST_OBSERVABILITY_DELAYED_AFTER_HOURS) return 'delayed';
  return 'fresh';
}

function latestObservedByWorkItem(
  rows: readonly CrmForecastSnapshotObservedRow[]
): Map<string, CrmForecastSnapshotObservedRow> {
  const latest = new Map<string, CrmForecastSnapshotObservedRow>();
  for (const row of rows) {
    const key = workItemKey(row);
    const previous = latest.get(key);
    if (
      !previous ||
      row.snapshotVersion > previous.snapshotVersion ||
      (row.snapshotVersion === previous.snapshotVersion && row.createdAt > previous.createdAt)
    ) {
      latest.set(key, row);
    }
  }
  return latest;
}

function maxIso(values: readonly string[]): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!latest || value > latest) return value;
    return latest;
  }, null);
}

function compareCoverageRows(
  left: AdminCrmForecastObservabilityCoverageRow,
  right: AdminCrmForecastObservabilityCoverageRow
): number {
  const severity: Record<AdminCrmForecastObservabilityStatus, number> = {
    missing: 0,
    stale: 1,
    delayed: 2,
    fresh: 3,
  };
  const byStatus = severity[left.status] - severity[right.status];
  if (byStatus !== 0) return byStatus;
  const byBranchLabel = left.branchLabel.localeCompare(right.branchLabel);
  if (byBranchLabel !== 0) return byBranchLabel;
  const byPipelineLabel = left.pipelineLabel.localeCompare(right.pipelineLabel);
  if (byPipelineLabel !== 0) return byPipelineLabel;
  const byCurrency = left.currencyCode.localeCompare(right.currencyCode);
  if (byCurrency !== 0) return byCurrency;
  const byBranchId = (left.branchId ?? '').localeCompare(right.branchId ?? '');
  if (byBranchId !== 0) return byBranchId;
  return left.pipelineId.localeCompare(right.pipelineId);
}

function deriveBatchRows(
  rows: readonly CrmForecastSnapshotObservedRow[]
): AdminCrmForecastObservabilityBatchRow[] {
  const missingSourceRunKey = '\u0000missing-source-run';
  const batches = new Map<
    string,
    {
      branches: Set<string>;
      currencies: Set<string>;
      firstSnapshotCreatedAt: string;
      lastSnapshotCreatedAt: string;
      pipelines: Set<string>;
      snapshotDate: string;
      sourceRunId: string | null;
      workItems: Set<string>;
    }
  >();

  for (const row of rows) {
    const sourceRunKey = row.sourceRunId ?? missingSourceRunKey;
    const existing = batches.get(sourceRunKey);
    const batch = existing ?? {
      branches: new Set<string>(),
      currencies: new Set<string>(),
      firstSnapshotCreatedAt: row.createdAt,
      lastSnapshotCreatedAt: row.createdAt,
      pipelines: new Set<string>(),
      snapshotDate: row.snapshotDate,
      sourceRunId: row.sourceRunId,
      workItems: new Set<string>(),
    };
    batch.firstSnapshotCreatedAt =
      row.createdAt < batch.firstSnapshotCreatedAt ? row.createdAt : batch.firstSnapshotCreatedAt;
    batch.lastSnapshotCreatedAt =
      row.createdAt > batch.lastSnapshotCreatedAt ? row.createdAt : batch.lastSnapshotCreatedAt;
    batch.branches.add(row.branchId ?? '');
    batch.currencies.add(row.currencyCode);
    batch.pipelines.add(row.pipelineId);
    batch.workItems.add(workItemKey(row));
    batches.set(sourceRunKey, batch);
  }

  return [...batches.entries()]
    .map(([, batch]) => ({
      branchCount: batch.branches.size,
      currencyCount: batch.currencies.size,
      firstSnapshotCreatedAt: batch.firstSnapshotCreatedAt,
      lastSnapshotCreatedAt: batch.lastSnapshotCreatedAt,
      observedWorkItems: batch.workItems.size,
      pipelineCount: batch.pipelines.size,
      snapshotDate: batch.snapshotDate,
      sourceRunId: batch.sourceRunId,
    }))
    .sort((left, right) => {
      const byLastSnapshot = right.lastSnapshotCreatedAt.localeCompare(left.lastSnapshotCreatedAt);
      if (byLastSnapshot !== 0) return byLastSnapshot;
      return (left.sourceRunId ?? '').localeCompare(right.sourceRunId ?? '');
    })
    .slice(0, ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_BATCH_ROWS);
}

export function deriveAdminCrmForecastObservability(args: {
  expectedWorkItems: readonly CrmForecastSnapshotWorkItem[];
  expectedWorkItemsDeferred: number;
  generatedAt: string;
  noBranchLabel: string;
  observedSnapshots: readonly CrmForecastSnapshotObservedRow[];
  snapshotDate: string;
}): AdminCrmForecastObservabilityWidget {
  const latestObserved = latestObservedByWorkItem(args.observedSnapshots);
  const expectedKeys = new Set(args.expectedWorkItems.map(workItemKey));
  const observedKeys = new Set(args.observedSnapshots.map(workItemKey));
  let unexpectedObservedWorkItems = 0;
  for (const key of observedKeys) {
    if (!expectedKeys.has(key)) unexpectedObservedWorkItems += 1;
  }

  let missingWorkItems = 0;
  let delayedWorkItems = 0;
  let staleWorkItems = 0;
  const matchedCreatedAt: string[] = [];
  const coverageRows = args.expectedWorkItems
    .map(workItem => {
      const observed = latestObserved.get(workItemKey(workItem));
      if (!observed) {
        missingWorkItems += 1;
        return {
          branchId: workItem.branchId ?? null,
          branchLabel: workItem.branchId ?? args.noBranchLabel,
          currencyCode: workItem.currencyCode,
          latestSnapshotCreatedAt: null,
          pipelineId: workItem.pipelineId,
          pipelineLabel: pipelineLabel(workItem.pipelineId),
          snapshotDate: args.snapshotDate,
          snapshotVersion: null,
          sourceRunId: null,
          status: 'missing' as const,
        };
      }
      const status = deriveAdminCrmForecastObservabilityStatus(
        observed.createdAt,
        args.generatedAt
      );
      if (status === 'delayed') delayedWorkItems += 1;
      if (status === 'stale') staleWorkItems += 1;
      matchedCreatedAt.push(observed.createdAt);
      return {
        branchId: workItem.branchId ?? null,
        branchLabel: workItem.branchId ?? args.noBranchLabel,
        currencyCode: workItem.currencyCode,
        latestSnapshotCreatedAt: observed.createdAt,
        pipelineId: workItem.pipelineId,
        pipelineLabel: pipelineLabel(workItem.pipelineId),
        snapshotDate: args.snapshotDate,
        snapshotVersion: observed.snapshotVersion,
        sourceRunId: observed.sourceRunId,
        status,
      };
    })
    .sort(compareCoverageRows);

  const batchRows = deriveBatchRows(args.observedSnapshots);
  const latestBatch = batchRows[0] ?? null;
  const summary: AdminCrmForecastObservabilitySummary = {
    delayedWorkItems,
    expectedWorkItems: args.expectedWorkItems.length,
    expectedWorkItemsDeferred: args.expectedWorkItemsDeferred,
    generatedAt: args.generatedAt,
    latestSnapshotCreatedAt: maxIso(matchedCreatedAt),
    latestSourceRunId: latestBatch?.sourceRunId ?? null,
    missingWorkItems,
    observedWorkItems: observedKeys.size,
    snapshotDate: args.snapshotDate,
    staleWorkItems,
    unexpectedObservedWorkItems,
  };

  if (coverageRows.length === 0 && batchRows.length === 0) {
    return {
      batchRows: [],
      coverageRows: [],
      hiddenCoverageRowCount: 0,
      state: 'empty',
      summary,
    };
  }

  return {
    batchRows,
    coverageRows: coverageRows.slice(0, ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_COVERAGE_ROWS),
    hiddenCoverageRowCount: Math.max(
      0,
      coverageRows.length - ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_COVERAGE_ROWS
    ),
    state: 'data',
    summary,
  };
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

async function readForecastObservabilityWidget(args: {
  actor: CrmActorContext;
  generatedAt: string;
  noBranchLabel: string;
  observabilityRepository: CrmForecastSnapshotObservabilityRepository;
  snapshotDate: string;
  workItemRepository: CrmForecastSnapshotWorkItemRepository;
}): Promise<AdminCrmForecastObservabilityWidget> {
  const { snapshotDateEndExclusive, snapshotDateStartInclusive } = snapshotDateRange(
    args.snapshotDate
  );
  const limit = Math.min(
    CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN,
    ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_COVERAGE_ROWS
  );
  const [expected, observedSnapshots] = await Promise.all([
    args.workItemRepository.listWorkItems({
      limit,
      snapshotDateEndExclusive,
      snapshotDateStartInclusive,
      tenantId: args.actor.tenantId,
    }),
    args.observabilityRepository.listObservedSnapshots({
      snapshotDate: args.snapshotDate,
      tenantId: args.actor.tenantId,
    }),
  ]);

  return deriveAdminCrmForecastObservability({
    expectedWorkItems: expected.workItems,
    expectedWorkItemsDeferred: expected.workItemsDeferred,
    generatedAt: args.generatedAt,
    noBranchLabel: args.noBranchLabel,
    observedSnapshots,
    snapshotDate: args.snapshotDate,
  });
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

async function settleForecastObservabilityWidget(
  promise: Promise<AdminCrmForecastObservabilityWidget>,
  logger: Pick<Console, 'error'>
): Promise<AdminCrmForecastObservabilityWidget> {
  try {
    return await promise;
  } catch (error) {
    logger.error('[AdminCrmReporting] forecastObservability failed', error);
    return {
      batchRows: [],
      coverageRows: [],
      hiddenCoverageRowCount: 0,
      messageKey: ADMIN_CRM_REPORTING_ERROR_MESSAGE_BY_REASON.repository_failure,
      state: 'error',
      summary: null,
    };
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
  const forecastSnapshotObservabilityRepository =
    options.forecastSnapshotObservabilityRepository ?? crmForecastSnapshotObservabilityRepository;
  const forecastSnapshotWorkItemRepository =
    options.forecastSnapshotWorkItemRepository ?? crmForecastSnapshotWorkItemRepository;
  const logger = options.logger ?? console;
  const noBranchLabel = options.labels?.noBranch ?? 'No branch';
  const snapshotDate = getPreviousUtcSnapshotDate(nowIso);

  const [snapshot, branchPipeline, sourceBreakdown, forecastObservability] = await Promise.all([
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
    settleForecastObservabilityWidget(
      readForecastObservabilityWidget({
        actor: args.actor,
        generatedAt: nowIso,
        noBranchLabel,
        observabilityRepository: forecastSnapshotObservabilityRepository,
        snapshotDate,
        workItemRepository: forecastSnapshotWorkItemRepository,
      }),
      logger
    ),
  ]);

  return {
    branchPipeline,
    forecastObservability,
    generatedAt: nowIso,
    snapshot,
    snapshotDate,
    sourceBreakdown,
    window,
  };
}
