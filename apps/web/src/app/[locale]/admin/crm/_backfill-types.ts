export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_CONFIRMATION_TTL_SECONDS = 600;
export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_DRY_RUN_RATE_LIMIT = 6;
export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_WRITE_RATE_LIMIT = 2;
export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_RATE_LIMIT_WINDOW_SECONDS = 60;
export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MARKER_PREFIX =
  'admin-crm-forecast-backfill-operator-';

export type AdminCrmForecastBackfillOperatorMode = 'dry_run' | 'write';

export type AdminCrmForecastBackfillOperatorResultStatus = 'completed' | 'partial' | 'failed';

export type AdminCrmForecastBackfillOperatorUiStatus =
  | 'idle'
  | 'dry_run_pending'
  | 'ready_to_confirm'
  | 'write_pending'
  | 'result';

export type AdminCrmForecastBackfillOperatorErrorCode =
  | 'all_dates_failed'
  | 'confirmation_expired'
  | 'confirmation_in_flight'
  | 'confirmation_invalid'
  | 'date_out_of_bounds'
  | 'internal_error'
  | 'invalid_range'
  | 'invalid_request'
  | 'invalid_tenant'
  | 'partial_failure'
  | 'range_too_large'
  | 'rate_limited'
  | 'unauthorized';

export interface AdminCrmForecastBackfillOperatorRequest {
  tenantId: string;
  fromDate: string;
  toDate: string;
  maxWorkItemsPerDate?: number;
}

export interface AdminCrmForecastBackfillOperatorActionInput {
  confirmationToken?: string | null;
  mode: AdminCrmForecastBackfillOperatorMode;
  request: AdminCrmForecastBackfillOperatorRequest;
}

export interface AdminCrmForecastBackfillOperatorDateRow {
  failedWorkItems: number;
  snapshotDate: string;
  snapshotsInserted: number;
  status: 'completed' | 'deferred' | 'failed' | 'partial';
  versionConflicts: number;
  workItemsConsidered: number;
  workItemsDeferred: number;
  workItemsSucceeded: number;
}

export interface AdminCrmForecastBackfillOperatorResult {
  confirmationToken: string | null;
  dateRows: AdminCrmForecastBackfillOperatorDateRow[];
  datesCompleted: number;
  datesConsidered: number;
  datesDeferred: number;
  datesFailed: number;
  datesPartial: number;
  fromDate: string;
  generatedAt: string;
  mode: AdminCrmForecastBackfillOperatorMode;
  snapshotVersionConflicts: number;
  snapshotsInserted: number;
  sourceRunId: string | null;
  status: AdminCrmForecastBackfillOperatorResultStatus;
  tenantId: string;
  toDate: string;
  workItemsConsidered: number;
  workItemsDeferred: number;
  workItemsFailed: number;
  workItemsSucceeded: number;
}

export type AdminCrmForecastBackfillOperatorActionResult =
  | {
      errorCode?: null;
      result: AdminCrmForecastBackfillOperatorResult;
      success: true;
    }
  | {
      errorCode: AdminCrmForecastBackfillOperatorErrorCode;
      result?: AdminCrmForecastBackfillOperatorResult | null;
      success: false;
    };
