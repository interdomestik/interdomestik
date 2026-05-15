import { z } from 'zod';

import { enforceRateLimitForAction } from '@/lib/rate-limit';

import {
  CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_DAYS,
  CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_WORK_ITEMS_PER_DATE,
  CrmForecastSnapshotBackfillCoreError,
  assertNoCrmForecastSnapshotBackfillPiiKeys,
  runCrmForecastSnapshotBackfillCore,
  type CrmForecastSnapshotBackfillDateResult,
  type CrmForecastSnapshotBackfillResult,
} from '../../../api/cron/crm/forecast-snapshots/backfill/_core';
import {
  adminCrmForecastBackfillConfirmationStore,
  type AdminCrmForecastBackfillConfirmationStore,
  type AdminCrmForecastBackfillConfirmationTuple,
} from './_backfill-confirmation';
import {
  ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_DRY_RUN_RATE_LIMIT,
  ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_RATE_LIMIT_WINDOW_SECONDS,
  ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_WRITE_RATE_LIMIT,
  type AdminCrmForecastBackfillOperatorActionResult,
  type AdminCrmForecastBackfillOperatorDateRow,
  type AdminCrmForecastBackfillOperatorErrorCode,
  type AdminCrmForecastBackfillOperatorMode,
  type AdminCrmForecastBackfillOperatorRequest,
  type AdminCrmForecastBackfillOperatorResult,
  type AdminCrmForecastBackfillOperatorResultStatus,
} from './_backfill-types';

export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MAX_DATE_ROWS =
  CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_DAYS;
export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MAX_WORK_ITEMS_PER_DATE =
  CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_WORK_ITEMS_PER_DATE;

export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_ALLOWED_SESSION_ROLES = [
  'admin',
  'tenant_admin',
  'super_admin',
] as const;

export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_FORBIDDEN_PII_KEYS = [
  'accountId',
  'bodyHtml',
  'bodyText',
  'contactId',
  'dealId',
  'description',
  'email',
  'fullName',
  'leadId',
  'name',
  'notes',
  'phone',
  'subject',
] as const;

const ALLOWED_SESSION_ROLE_SET = new Set<string>(
  ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_ALLOWED_SESSION_ROLES
);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TENANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const requestSchema = z
  .object({
    fromDate: z.string().regex(DATE_PATTERN),
    maxWorkItemsPerDate: z
      .number()
      .int()
      .positive()
      .max(CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_WORK_ITEMS_PER_DATE)
      .optional(),
    tenantId: z.string().trim().regex(TENANT_ID_PATTERN),
    toDate: z.string().regex(DATE_PATTERN),
  })
  .strict();

const actionInputSchema = z
  .object({
    confirmationToken: z.string().min(1).optional().nullable(),
    mode: z.enum(['dry_run', 'write']),
    request: requestSchema,
  })
  .strict();

export interface AdminCrmForecastBackfillOperatorSession {
  user?: {
    branchId?: string | null;
    id?: string;
    role?: string | null;
    tenantId?: string | null;
  } | null;
}

export interface RunAdminCrmForecastBackfillOperatorCoreDeps {
  confirmationStore?: AdminCrmForecastBackfillConfirmationStore;
  headers?: Headers;
  logger?: Pick<Console, 'error' | 'info' | 'warn'>;
  now?: () => Date;
  rateLimit?: typeof enforceRateLimitForAction;
  runBackfillCore?: typeof runCrmForecastSnapshotBackfillCore;
}

export async function runAdminCrmForecastBackfillOperatorCore(
  args: {
    input: unknown;
    session: AdminCrmForecastBackfillOperatorSession | null;
  },
  deps: RunAdminCrmForecastBackfillOperatorCoreDeps = {}
): Promise<AdminCrmForecastBackfillOperatorActionResult> {
  const actor = resolveAdminActor(args.session);
  if (!actor) return errorResult('unauthorized');

  const parsed = actionInputSchema.safeParse(args.input);
  if (!parsed.success) return errorResult(validationErrorCode(parsed.error));

  const request = normalizeRequest(parsed.data.request);
  if (request.tenantId !== actor.tenantId) return errorResult('invalid_tenant');

  const mode = parsed.data.mode;
  const limited = await enforceOperatorRateLimit({
    actorId: actor.actorId,
    headers: deps.headers ?? new Headers(),
    mode,
    rateLimit: deps.rateLimit ?? enforceRateLimitForAction,
  });
  if (limited?.limited) return errorResult('rate_limited');

  const now = (deps.now ?? (() => new Date()))();
  const tuple = confirmationTuple(actor.actorId, request);
  let consumedTokenId: string | null = null;
  const confirmationStore = deps.confirmationStore ?? adminCrmForecastBackfillConfirmationStore;

  if (mode === 'write') {
    const confirmationToken = parsed.data.confirmationToken?.trim();
    if (!confirmationToken) return errorResult('confirmation_invalid');
    const consumed = confirmationStore.consume(confirmationToken, tuple, now);
    if ('error' in consumed) return errorResult(consumed.error);
    consumedTokenId = consumed.tokenId;
  }

  try {
    const coreResult = await (deps.runBackfillCore ?? runCrmForecastSnapshotBackfillCore)({
      dryRun: mode === 'dry_run',
      fromDate: request.fromDate,
      maxWorkItemsPerDate: request.maxWorkItemsPerDate,
      now,
      tenantId: actor.tenantId,
      toDate: request.toDate,
    });
    const projected = projectBackfillResult({
      confirmationStore,
      coreResult,
      generatedAt: now.toISOString(),
      mode,
      tuple,
    });
    assertNoAdminCrmForecastBackfillOperatorPiiKeys(projected);
    logOperatorResult(projected, {
      actorId: actor.actorId,
      logger: deps.logger ?? console,
      tokenId: consumedTokenId,
    });

    if (projected.status === 'failed') {
      return { errorCode: 'all_dates_failed', result: projected, success: false };
    }
    return { result: projected, success: true };
  } catch (error) {
    const mapped = mapOperatorError(error);
    if (mapped !== 'internal_error') return errorResult(mapped);
    (deps.logger ?? console).error('[Admin CRM Forecast Backfill Operator] action failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      mode,
      tenantId: actor.tenantId,
    });
    return errorResult('internal_error');
  } finally {
    if (consumedTokenId) confirmationStore.finalize(consumedTokenId);
  }
}

export function assertNoAdminCrmForecastBackfillOperatorPiiKeys(value: unknown): void {
  assertNoCrmForecastSnapshotBackfillPiiKeys(value);
  const keys = new Set<string>();
  collectKeys(value, keys);
  for (const key of keys) {
    if (
      (ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_FORBIDDEN_PII_KEYS as readonly string[]).includes(key)
    ) {
      throw new Error(`Admin CRM forecast backfill operator output contains PII key: ${key}`);
    }
  }
}

function resolveAdminActor(session: AdminCrmForecastBackfillOperatorSession | null): {
  actorId: string;
  role: 'admin';
  tenantId: string;
} | null {
  const role = session?.user?.role;
  const actorId = session?.user?.id;
  const tenantId = session?.user?.tenantId;
  if (!role || !actorId || !tenantId) return null;
  if (!ALLOWED_SESSION_ROLE_SET.has(role)) return null;
  return { actorId, role: 'admin', tenantId };
}

function normalizeRequest(
  request: AdminCrmForecastBackfillOperatorRequest
): AdminCrmForecastBackfillOperatorRequest {
  return {
    fromDate: request.fromDate,
    maxWorkItemsPerDate: request.maxWorkItemsPerDate,
    tenantId: request.tenantId.trim(),
    toDate: request.toDate,
  };
}

function confirmationTuple(
  actorId: string,
  request: AdminCrmForecastBackfillOperatorRequest
): AdminCrmForecastBackfillConfirmationTuple {
  return {
    actorId,
    fromDate: request.fromDate,
    maxWorkItemsPerDate: request.maxWorkItemsPerDate ?? null,
    tenantId: request.tenantId,
    toDate: request.toDate,
  };
}

async function enforceOperatorRateLimit(args: {
  actorId: string;
  headers: Headers;
  mode: AdminCrmForecastBackfillOperatorMode;
  rateLimit: typeof enforceRateLimitForAction;
}): Promise<Awaited<ReturnType<typeof enforceRateLimitForAction>> | null> {
  return args.rateLimit({
    headers: args.headers,
    keySuffix: args.actorId,
    limit:
      args.mode === 'dry_run'
        ? ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_DRY_RUN_RATE_LIMIT
        : ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_WRITE_RATE_LIMIT,
    name: `action:admin-crm-forecast-backfill:${args.mode}:${args.actorId}`,
    productionSensitive: true,
    windowSeconds: ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_RATE_LIMIT_WINDOW_SECONDS,
  });
}

function projectBackfillResult(args: {
  confirmationStore: AdminCrmForecastBackfillConfirmationStore;
  coreResult: CrmForecastSnapshotBackfillResult;
  generatedAt: string;
  mode: AdminCrmForecastBackfillOperatorMode;
  tuple: AdminCrmForecastBackfillConfirmationTuple;
}): AdminCrmForecastBackfillOperatorResult {
  const status = aggregateStatus(args.coreResult);
  const confirmationToken =
    args.mode === 'dry_run' && status !== 'failed'
      ? args.confirmationStore.create(args.tuple, args.coreResult.completedAt)
      : null;
  const dateRows = args.coreResult.dateResults
    .map(projectDateRow)
    .sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate))
    .slice(0, ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MAX_DATE_ROWS);

  return {
    confirmationToken,
    dateRows,
    datesCompleted: args.coreResult.dateResults.filter(
      row => row.status === 'completed' || row.status === 'dry_run'
    ).length,
    datesConsidered: args.coreResult.datesConsidered,
    datesDeferred: args.coreResult.datesDeferred,
    datesFailed: args.coreResult.datesFailed,
    datesPartial: args.coreResult.dateResults.filter(row => row.status === 'partial').length,
    fromDate: args.coreResult.fromDate,
    generatedAt: args.generatedAt,
    mode: args.mode,
    snapshotVersionConflicts: args.coreResult.versionConflicts,
    snapshotsInserted: args.mode === 'dry_run' ? 0 : args.coreResult.snapshotsInserted,
    sourceRunId: args.coreResult.sourceRunId ?? null,
    status,
    tenantId: args.coreResult.tenantId,
    toDate: args.coreResult.toDate,
    workItemsConsidered: args.coreResult.workItemsConsidered,
    workItemsDeferred: args.coreResult.workItemsDeferred,
    workItemsFailed: args.coreResult.failedWorkItems,
    workItemsSucceeded: args.coreResult.workItemsSucceeded,
  };
}

function aggregateStatus(
  result: CrmForecastSnapshotBackfillResult
): AdminCrmForecastBackfillOperatorResultStatus {
  if (result.datesConsidered > 0 && result.datesFailed === result.datesConsidered) {
    return 'failed';
  }
  if (
    result.datesDeferred > 0 ||
    result.datesFailed > 0 ||
    result.failedWorkItems > 0 ||
    result.workItemsDeferred > 0
  ) {
    return 'partial';
  }
  return 'completed';
}

function projectDateRow(
  row: CrmForecastSnapshotBackfillDateResult
): AdminCrmForecastBackfillOperatorDateRow {
  const status =
    row.status === 'dry_run'
      ? 'completed'
      : row.status === 'completed' ||
          row.status === 'deferred' ||
          row.status === 'failed' ||
          row.status === 'partial'
        ? row.status
        : 'partial';
  return {
    failedWorkItems: row.failedWorkItems,
    snapshotDate: row.snapshotDate,
    snapshotsInserted: row.snapshotsInserted,
    status,
    versionConflicts: row.versionConflicts,
    workItemsConsidered: row.workItemsConsidered,
    workItemsDeferred: row.workItemsDeferred,
    workItemsSucceeded: row.workItemsSucceeded,
  };
}

function validationErrorCode(error: z.ZodError): AdminCrmForecastBackfillOperatorErrorCode {
  if (error.issues.some(issue => issue.path.join('.') === 'request.tenantId')) {
    return 'invalid_tenant';
  }
  if (error.issues.some(issue => issue.code === 'unrecognized_keys')) return 'invalid_request';
  return 'invalid_range';
}

function mapOperatorError(error: unknown): AdminCrmForecastBackfillOperatorErrorCode {
  if (error instanceof CrmForecastSnapshotBackfillCoreError) {
    return error.code;
  }
  return 'internal_error';
}

function errorResult(
  errorCode: AdminCrmForecastBackfillOperatorErrorCode
): AdminCrmForecastBackfillOperatorActionResult {
  return { errorCode, result: null, success: false };
}

function logOperatorResult(
  result: AdminCrmForecastBackfillOperatorResult,
  args: {
    actorId: string;
    logger: Pick<Console, 'info' | 'warn'>;
    tokenId: string | null;
  }
): void {
  const payload = {
    actorId: args.actorId,
    confirmationTokenId: args.tokenId,
    fromDate: result.fromDate,
    mode: result.mode,
    outcome: result.status,
    snapshotsInserted: result.snapshotsInserted,
    tenantId: result.tenantId,
    toDate: result.toDate,
    versionConflicts: result.snapshotVersionConflicts,
  };
  if (result.status === 'partial' || result.status === 'failed') {
    args.logger.warn('[Admin CRM Forecast Backfill Operator] run completed with warnings', payload);
  } else {
    args.logger.info('[Admin CRM Forecast Backfill Operator] run completed', payload);
  }
}

function collectKeys(value: unknown, keys: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(item => collectKeys(item, keys));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectKeys(nested, keys);
  }
}
