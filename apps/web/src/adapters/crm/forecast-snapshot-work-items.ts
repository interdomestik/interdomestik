import { and, asc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import { crmDeals, crmPipelines, crmPipelineStages } from '@interdomestik/database/schema';

import { listTenantIdsForScheduledWork } from '@interdomestik/database';

import { runInCrmTenantContext } from './tenant-runner';

export const CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN = 1000;
const CRM_FORECAST_SNAPSHOT_DEFERRED_COUNT_LIMIT = 2_147_483_647;

export type CrmForecastSnapshotWorkItem = {
  branchId?: string | null;
  currencyCode: string;
  pipelineId: string;
  tenantId: string;
};

export type CrmForecastSnapshotWorkItemList = {
  workItems: CrmForecastSnapshotWorkItem[];
  workItemsDeferred: number;
};

export interface CrmForecastSnapshotWorkItemRepository {
  listWorkItems(params: {
    snapshotDateStartInclusive: Date;
    limit?: number;
    snapshotDateEndExclusive: Date;
    tenantId?: string;
  }): Promise<CrmForecastSnapshotWorkItemList>;
}

type WorkItemRow = {
  branchId: string | null;
  currencyCode: string | null;
  pipelineId: string | null;
  tenantId: string;
};

type CrmForecastSnapshotWorkItemDb = Pick<typeof db, 'select'>;

export function createCrmForecastSnapshotWorkItemRepository(
  database: CrmForecastSnapshotWorkItemDb = db
): CrmForecastSnapshotWorkItemRepository {
  return {
    async listWorkItems(params) {
      const limit = params.limit ?? CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN;

      const rows = await runWorkItemQuery(database, params, limit + 1);
      if (rows.length <= limit) {
        return mapWorkItemRows(rows, limit, rows.length);
      }

      const allRows = await runWorkItemQuery(
        database,
        params,
        CRM_FORECAST_SNAPSHOT_DEFERRED_COUNT_LIMIT
      );
      return mapWorkItemRows(rows, limit, allRows.length);
    },
  };
}

export const crmForecastSnapshotWorkItemRepository = createCrmForecastSnapshotWorkItemRepository();

export function mapWorkItemRows(
  rows: readonly WorkItemRow[],
  limit: number,
  totalRows = rows.length
): CrmForecastSnapshotWorkItemList {
  const limitedRows = rows.slice(0, limit);
  return {
    workItems: limitedRows.flatMap(row => {
      if (!row.pipelineId || !row.currencyCode) return [];
      return [
        {
          branchId: row.branchId,
          currencyCode: row.currencyCode,
          pipelineId: row.pipelineId,
          tenantId: row.tenantId,
        },
      ];
    }),
    workItemsDeferred: Math.max(0, totalRows - limit),
  };
}

type WorkItemQueryParams = {
  snapshotDateStartInclusive: Date;
  snapshotDateEndExclusive: Date;
  tenantId?: string;
};

async function runWorkItemQuery(
  database: CrmForecastSnapshotWorkItemDb,
  params: WorkItemQueryParams,
  limit: number
): Promise<WorkItemRow[]> {
  const { tenantId } = params;
  if (tenantId) {
    return runInCrmTenantContext(database, { tenantId }, async scoped =>
      buildWorkItemQuery(scoped, { ...params, tenantId }).limit(limit)
    );
  }

  // Scheduler run: visit tenants in id order (the query's leading sort key) with a shared row
  // budget, so the concatenation equals the former single cross-tenant ordered result.
  const rows: WorkItemRow[] = [];
  for (const scheduledTenantId of await listTenantIdsForScheduledWork()) {
    const remaining = limit - rows.length;
    if (remaining <= 0) break;
    rows.push(
      ...(await runInCrmTenantContext(database, { tenantId: scheduledTenantId }, async scoped =>
        buildWorkItemQuery(scoped, { ...params, tenantId: scheduledTenantId }).limit(remaining)
      ))
    );
  }
  return rows;
}

function buildWorkItemQuery(
  database: CrmForecastSnapshotWorkItemDb,
  params: {
    snapshotDateStartInclusive: Date;
    snapshotDateEndExclusive: Date;
    tenantId: string;
  }
) {
  const basePredicates = [
    isNull(crmDeals.archivedAt),
    isNull(crmPipelines.archivedAt),
    isNull(crmPipelineStages.archivedAt),
    isNotNull(crmDeals.pipelineId),
    isNotNull(crmDeals.currentStageId),
    isNotNull(crmDeals.currencyCode),
    isNotNull(crmDeals.valueAmountMinor),
    gte(crmDeals.createdAt, params.snapshotDateStartInclusive),
    lt(crmDeals.createdAt, params.snapshotDateEndExclusive),
  ];

  const query = database
    .select({
      branchId: crmDeals.branchId,
      currencyCode: crmDeals.currencyCode,
      pipelineId: crmDeals.pipelineId,
      tenantId: crmDeals.tenantId,
    })
    .from(crmDeals)
    .innerJoin(
      crmPipelines,
      and(eq(crmPipelines.tenantId, crmDeals.tenantId), eq(crmPipelines.id, crmDeals.pipelineId))
    )
    .innerJoin(
      crmPipelineStages,
      and(
        eq(crmPipelineStages.tenantId, crmDeals.tenantId),
        eq(crmPipelineStages.id, crmDeals.currentStageId)
      )
    );

  // db-access-guard: tenant-predicate -- reason: work items for exactly one tenant (the authorized admin tenant or the scheduler-visited tenant)
  return query
    .where(and(eq(crmDeals.tenantId, params.tenantId), ...basePredicates))
    .groupBy(crmDeals.tenantId, crmDeals.pipelineId, crmDeals.branchId, crmDeals.currencyCode)
    .orderBy(
      asc(crmDeals.tenantId),
      asc(crmDeals.pipelineId),
      asc(crmDeals.branchId),
      asc(crmDeals.currencyCode)
    );
}
