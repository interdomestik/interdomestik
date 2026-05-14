import { and, asc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import { crmDeals, crmPipelines, crmPipelineStages } from '@interdomestik/database/schema';

export const CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN = 1000;

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

      // db-access-guard: tenant-scoped -- reason: CRM forecast snapshot work-item discovery groups tenant-scoped normalized deals and carries tenant ids into every scheduler repository call
      const rows = await database
        .select({
          branchId: crmDeals.branchId,
          currencyCode: crmDeals.currencyCode,
          pipelineId: crmDeals.pipelineId,
          tenantId: crmDeals.tenantId,
        })
        .from(crmDeals)
        .innerJoin(
          crmPipelines,
          and(
            eq(crmPipelines.tenantId, crmDeals.tenantId),
            eq(crmPipelines.id, crmDeals.pipelineId)
          )
        )
        .innerJoin(
          crmPipelineStages,
          and(
            eq(crmPipelineStages.tenantId, crmDeals.tenantId),
            eq(crmPipelineStages.id, crmDeals.currentStageId)
          )
        )
        .where(
          and(
            isNull(crmDeals.archivedAt),
            isNull(crmPipelines.archivedAt),
            isNull(crmPipelineStages.archivedAt),
            isNotNull(crmDeals.pipelineId),
            isNotNull(crmDeals.currentStageId),
            isNotNull(crmDeals.currencyCode),
            isNotNull(crmDeals.valueAmountMinor),
            gte(crmDeals.createdAt, params.snapshotDateStartInclusive),
            lt(crmDeals.createdAt, params.snapshotDateEndExclusive)
          )
        )
        .groupBy(crmDeals.tenantId, crmDeals.pipelineId, crmDeals.branchId, crmDeals.currencyCode)
        .orderBy(
          asc(crmDeals.tenantId),
          asc(crmDeals.pipelineId),
          asc(crmDeals.branchId),
          asc(crmDeals.currencyCode)
        )
        .limit(limit + 1);

      return mapWorkItemRows(rows, limit);
    },
  };
}

export const crmForecastSnapshotWorkItemRepository = createCrmForecastSnapshotWorkItemRepository();

export function mapWorkItemRows(
  rows: readonly WorkItemRow[],
  limit: number
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
    workItemsDeferred: Math.max(0, rows.length - limit),
  };
}
