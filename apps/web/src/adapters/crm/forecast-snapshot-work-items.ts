import { and, asc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import { crmDeals, crmPipelines, crmPipelineStages } from '@interdomestik/database/schema';

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
  if (!params.tenantId) {
    // BLOCKED(rc31-u2): cross-tenant by design. The protected scheduler enumerates work items across
    // all tenants, so there is no single canonical tenant to scope. Needs a privileged manifest entry
    // or a per-tenant loop before this ambient-db read can run under the restricted role.
    return buildWorkItemQuery(database, params).limit(limit);
  }
  return runInCrmTenantContext(database, { tenantId: params.tenantId }, async scoped =>
    buildWorkItemQuery(scoped, params).limit(limit)
  );
}

function buildWorkItemQuery(
  database: CrmForecastSnapshotWorkItemDb,
  params: {
    snapshotDateStartInclusive: Date;
    snapshotDateEndExclusive: Date;
    tenantId?: string;
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

  if (params.tenantId) {
    // db-access-guard: tenant-predicate -- reason: admin forecast observability discovers expected work items for exactly the authorized admin tenant
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

  // db-access-guard: system-exempt -- reason: protected CRM forecast snapshot scheduler enumerates aggregate work items across tenants and carries tenant ids into each append-only snapshot write
  return query
    .where(and(...basePredicates))
    .groupBy(crmDeals.tenantId, crmDeals.pipelineId, crmDeals.branchId, crmDeals.currencyCode)
    .orderBy(
      asc(crmDeals.tenantId),
      asc(crmDeals.pipelineId),
      asc(crmDeals.branchId),
      asc(crmDeals.currencyCode)
    );
}
