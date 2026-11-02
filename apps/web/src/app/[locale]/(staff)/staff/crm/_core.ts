import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  authorizeCrmReportingRead,
  CRM_REPORTING_MAX_WINDOW_DAYS,
  deriveCrmFunnelConversion,
  deriveCrmStageVelocity,
  deriveCrmWeightedPipeline,
  type CrmReportingAuthorizationDenialReason,
  type CrmReportingWindow,
} from '@interdomestik/domain-crm/reporting';
import type { CrmReportingRepository } from '@interdomestik/domain-crm/reporting/repository';

import { createCrmReportingRepository } from '@/adapters/crm/reporting-repository';
import { aggregateStaffPipelineWorkloadRows, pipelineLabel } from './_pipeline-workload-rows';
export { STAFF_CRM_PIPELINE_MAX_ROWS } from './_pipeline-workload-rows';

export const STAFF_CRM_REPORTING_WINDOW_DAYS = 90;
export const STAFF_CRM_FUNNEL_MAX_STAGES = 12;
export const STAFF_CRM_STAGE_VELOCITY_MAX_STAGES = 12;
export const STAFF_CRM_STAGE_VELOCITY_MIN_SAMPLE_COUNT = 3;
export const STAFF_CRM_REPORTING_MARKER_PREFIX = 'staff-crm-reporting-';

export const STAFF_CRM_REPORTING_ERROR_MESSAGE_BY_REASON: Record<
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

export const STAFF_CRM_FORBIDDEN_PII_KEYS = [
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
] as const;

export interface StaffCrmPipelineWorkloadRow {
  branchId: string | null;
  branchLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  currencyCode: string;
  openDealCount: number;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
  forecastCommitAmountMinor: number;
  forecastBestAmountMinor: number;
  excludedInconsistentForecastCount: number;
}

export interface StaffCrmFunnelMovementRow {
  pipelineId: string;
  pipelineLabel: string;
  stageId: string;
  stageLabel: string;
  enteredCount: number;
  exitedCount: number;
  wonCount: number;
  lostCount: number;
  conversionRateBps: number;
  dropOffRateBps: number;
}

export interface StaffCrmStageVelocityRow {
  pipelineId: string;
  pipelineLabel: string;
  stageId: string;
  stageLabel: string;
  sampleCount: number;
  averageDays: number;
  medianDays: number;
  minimumDays: number;
  maximumDays: number;
}

export interface StaffCrmStageVelocityWidgetSummary {
  rows: readonly StaffCrmStageVelocityRow[];
  excludedOpenIntervalCount: number;
}

export type StaffCrmWidget<T> =
  | { state: 'data'; rows: T[]; excludedRowCount: number }
  | { state: 'empty'; rows: []; excludedRowCount: number }
  | { state: 'error'; rows: []; excludedRowCount: 0; messageKey: string };

export type StaffCrmStageVelocityWidget =
  | {
      state: 'data';
      summary: StaffCrmStageVelocityWidgetSummary;
      excludedRowCount: number;
    }
  | {
      state: 'empty';
      summary: StaffCrmStageVelocityWidgetSummary;
      excludedRowCount: number;
    }
  | {
      state: 'error';
      summary: StaffCrmStageVelocityWidgetSummary;
      excludedRowCount: 0;
      messageKey: string;
    };

export type StaffCrmReportingDashboard = {
  funnelMovement: StaffCrmWidget<StaffCrmFunnelMovementRow>;
  generatedAt: string;
  pipelineWorkload: StaffCrmWidget<StaffCrmPipelineWorkloadRow>;
  stageVelocity: StaffCrmStageVelocityWidget;
  window: CrmReportingWindow;
};

export class StaffCrmReportingAccessDeniedError extends Error {
  constructor(readonly reason: CrmReportingAuthorizationDenialReason) {
    super(`Staff CRM reporting read denied: ${reason}`);
    this.name = 'StaffCrmReportingAccessDeniedError';
  }
}

export type StaffCrmReportingCoreOptions = {
  labels?: {
    noBranch?: string;
  };
  logger?: Pick<Console, 'error'>;
  now?: () => string;
  reportingRepository?: CrmReportingRepository;
};

export function createStaffCrmReportingWindow(nowIso: string): CrmReportingWindow {
  const to = new Date(nowIso);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - STAFF_CRM_REPORTING_WINDOW_DAYS);
  return { from: from.toISOString(), to: to.toISOString() };
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

function stageLabel(stageId: string): string {
  return stageId;
}

function toWidget<T>(rows: T[], excludedRowCount = 0): StaffCrmWidget<T> {
  return rows.length > 0
    ? { excludedRowCount, rows, state: 'data' }
    : { excludedRowCount, rows: [], state: 'empty' };
}

function toStageVelocityWidget(
  summary: StaffCrmStageVelocityWidgetSummary
): StaffCrmStageVelocityWidget {
  return summary.rows.length > 0
    ? {
        excludedRowCount: summary.excludedOpenIntervalCount,
        state: 'data',
        summary,
      }
    : {
        excludedRowCount: summary.excludedOpenIntervalCount,
        state: 'empty',
        summary,
      };
}

function toErrorWidget<T>(
  reason: CrmReportingAuthorizationDenialReason | 'repository_failure'
): StaffCrmWidget<T> {
  return {
    excludedRowCount: 0,
    messageKey: STAFF_CRM_REPORTING_ERROR_MESSAGE_BY_REASON[reason],
    rows: [],
    state: 'error',
  };
}

function toStageVelocityErrorWidget(
  reason: CrmReportingAuthorizationDenialReason | 'repository_failure'
): StaffCrmStageVelocityWidget {
  return {
    excludedRowCount: 0,
    messageKey: STAFF_CRM_REPORTING_ERROR_MESSAGE_BY_REASON[reason],
    state: 'error',
    summary: { excludedOpenIntervalCount: 0, rows: [] },
  };
}

function denialReasonFromError(error: unknown): CrmReportingAuthorizationDenialReason | null {
  if (!(error instanceof Error) || !error.message.includes('CRM reporting read denied:')) {
    return null;
  }
  const reason = error.message.split(':').at(-1)?.trim();
  if (reason && reason in STAFF_CRM_REPORTING_ERROR_MESSAGE_BY_REASON) {
    return reason as CrmReportingAuthorizationDenialReason;
  }
  return null;
}

async function settleWidget<T>(
  promise: Promise<StaffCrmWidget<T>>,
  logger: Pick<Console, 'error'>,
  label: string
): Promise<StaffCrmWidget<T>> {
  try {
    return await promise;
  } catch (error) {
    const denialReason = denialReasonFromError(error);
    if (denialReason) return toErrorWidget(denialReason);
    logger.error(`[StaffCrmReporting] ${label} failed`, error);
    return toErrorWidget('repository_failure');
  }
}

async function settleStageVelocityWidget(
  promise: Promise<StaffCrmStageVelocityWidget>,
  logger: Pick<Console, 'error'>
): Promise<StaffCrmStageVelocityWidget> {
  try {
    return await promise;
  } catch (error) {
    const denialReason = denialReasonFromError(error);
    if (denialReason) return toStageVelocityErrorWidget(denialReason);
    logger.error('[StaffCrmReporting] stageVelocity failed', error);
    return toStageVelocityErrorWidget('repository_failure');
  }
}

async function readPipelineWorkloadWidget(args: {
  actor: CrmActorContext;
  labels: Required<StaffCrmReportingCoreOptions>['labels'];
  repository: CrmReportingRepository;
  window: CrmReportingWindow;
}): Promise<StaffCrmWidget<StaffCrmPipelineWorkloadRow>> {
  const input = { actor: args.actor, window: args.window };
  const rows = await args.repository.listWeightedPipelineRows(input);
  const report = deriveCrmWeightedPipeline(rows, { ...input, groupBy: ['branch', 'pipeline'] });
  const mapped = aggregateStaffPipelineWorkloadRows(
    rows,
    args.labels,
    report.excludedInconsistentForecastCount
  );

  return toWidget(mapped, countWeightedExclusions(report));
}

async function readFunnelMovementWidget(args: {
  actor: CrmActorContext;
  repository: CrmReportingRepository;
  window: CrmReportingWindow;
}): Promise<StaffCrmWidget<StaffCrmFunnelMovementRow>> {
  const input = { actor: args.actor, window: args.window };
  const rows = await args.repository.listFunnelConversionRows(input);
  const report = deriveCrmFunnelConversion(rows, { ...input, mode: 'period_entry' });
  const mapped = report.stages
    .map(stage => ({
      conversionRateBps: stage.conversionRateBps,
      dropOffRateBps: stage.dropOffRateBps,
      enteredCount: stage.enteredCount,
      exitedCount: stage.exitedCount,
      lostCount: stage.lostCount,
      pipelineId: stage.pipelineId,
      pipelineLabel: pipelineLabel(stage.pipelineId),
      stageId: stage.stageId,
      stageLabel: stageLabel(stage.stageId),
      wonCount: stage.wonCount,
    }))
    .sort((left, right) => {
      if (right.enteredCount !== left.enteredCount) return right.enteredCount - left.enteredCount;
      const byPipeline = left.pipelineId.localeCompare(right.pipelineId);
      if (byPipeline !== 0) return byPipeline;
      return left.stageId.localeCompare(right.stageId);
    })
    .slice(0, STAFF_CRM_FUNNEL_MAX_STAGES);

  return toWidget(mapped, report.excludedArchivedCount);
}

async function readStageVelocityWidget(args: {
  actor: CrmActorContext;
  nowIso: string;
  repository: CrmReportingRepository;
  window: CrmReportingWindow;
}): Promise<StaffCrmStageVelocityWidget> {
  const input = { actor: args.actor, window: args.window };
  const rows = await args.repository.listStageVelocityRows(input);
  const report = deriveCrmStageVelocity(rows, {
    ...input,
    includeOpenIntervals: false,
    now: args.nowIso,
  });
  const mapped = report.stages
    .filter(stage => stage.sampleCount >= STAFF_CRM_STAGE_VELOCITY_MIN_SAMPLE_COUNT)
    .map(stage => ({
      averageDays: stage.averageDays,
      maximumDays: stage.maximumDays,
      medianDays: stage.medianDays,
      minimumDays: stage.minimumDays,
      pipelineId: stage.pipelineId,
      pipelineLabel: pipelineLabel(stage.pipelineId),
      sampleCount: stage.sampleCount,
      stageId: stage.stageId,
      stageLabel: stageLabel(stage.stageId),
    }))
    .sort((left, right) => {
      if (right.medianDays !== left.medianDays) return right.medianDays - left.medianDays;
      if (right.sampleCount !== left.sampleCount) return right.sampleCount - left.sampleCount;
      const byPipeline = left.pipelineId.localeCompare(right.pipelineId);
      if (byPipeline !== 0) return byPipeline;
      return left.stageId.localeCompare(right.stageId);
    })
    .slice(0, STAFF_CRM_STAGE_VELOCITY_MAX_STAGES);

  return toStageVelocityWidget({
    excludedOpenIntervalCount: report.excludedOpenIntervalCount,
    rows: mapped,
  });
}

export async function getStaffCrmReportingCore(
  args: { actor: CrmActorContext; authority: TenantAuthority },
  options: StaffCrmReportingCoreOptions = {}
): Promise<StaffCrmReportingDashboard> {
  if (!args.actor.tenantId) {
    throw new StaffCrmReportingAccessDeniedError('tenant_scope');
  }
  if (args.actor.role !== 'staff') {
    throw new StaffCrmReportingAccessDeniedError('role_scope');
  }

  const nowIso = (options.now ?? (() => new Date().toISOString()))();
  const window = createStaffCrmReportingWindow(nowIso);
  if (STAFF_CRM_REPORTING_WINDOW_DAYS > CRM_REPORTING_MAX_WINDOW_DAYS) {
    throw new StaffCrmReportingAccessDeniedError('window_scope');
  }
  const denied = authorizeCrmReportingRead({ actor: args.actor, grouping: 'pipeline', window });
  if (denied) {
    throw new StaffCrmReportingAccessDeniedError(denied);
  }

  const repository = options.reportingRepository ?? createCrmReportingRepository(args.authority);
  const labels = {
    noBranch: options.labels?.noBranch ?? 'No branch',
  };
  const logger = options.logger ?? console;

  const [pipelineWorkload, funnelMovement, stageVelocity] = await Promise.all([
    settleWidget(
      readPipelineWorkloadWidget({ actor: args.actor, labels, repository, window }),
      logger,
      'pipelineWorkload'
    ),
    settleWidget(
      readFunnelMovementWidget({ actor: args.actor, repository, window }),
      logger,
      'funnelMovement'
    ),
    settleStageVelocityWidget(
      readStageVelocityWidget({ actor: args.actor, nowIso, repository, window }),
      logger
    ),
  ]);

  return {
    funnelMovement,
    generatedAt: nowIso,
    pipelineWorkload,
    stageVelocity,
    window,
  };
}
