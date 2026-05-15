import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import { crmPipelineSnapshots } from '@interdomestik/database/schema';

export type CrmForecastSnapshotObservedRow = {
  branchId: string | null;
  createdAt: string;
  currencyCode: string;
  pipelineId: string;
  snapshotDate: string;
  snapshotVersion: number;
  sourceRunId: string | null;
  tenantId: string;
};

export interface CrmForecastSnapshotObservabilityRepository {
  listObservedSnapshots(params: {
    snapshotDate: string;
    tenantId: string;
  }): Promise<CrmForecastSnapshotObservedRow[]>;
}

type CrmForecastSnapshotObservabilityDb = Pick<typeof db, 'select'>;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function createCrmForecastSnapshotObservabilityRepository(
  database: CrmForecastSnapshotObservabilityDb = db
): CrmForecastSnapshotObservabilityRepository {
  return {
    async listObservedSnapshots(params) {
      // db-access-guard: tenant-scoped -- reason: CRM forecast snapshot observability reads only aggregate snapshot rows for the authorized admin tenant and frozen snapshot date
      const rows = await database
        .select({
          branchId: crmPipelineSnapshots.branchId,
          createdAt: crmPipelineSnapshots.createdAt,
          currencyCode: crmPipelineSnapshots.currencyCode,
          pipelineId: crmPipelineSnapshots.pipelineId,
          snapshotDate: crmPipelineSnapshots.snapshotDate,
          snapshotVersion: crmPipelineSnapshots.snapshotVersion,
          sourceRunId: crmPipelineSnapshots.sourceRunId,
          tenantId: crmPipelineSnapshots.tenantId,
        })
        .from(crmPipelineSnapshots)
        .where(
          and(
            eq(crmPipelineSnapshots.tenantId, params.tenantId),
            eq(crmPipelineSnapshots.snapshotDate, params.snapshotDate)
          )
        )
        .orderBy(
          asc(crmPipelineSnapshots.pipelineId),
          asc(crmPipelineSnapshots.branchId),
          asc(crmPipelineSnapshots.currencyCode),
          desc(crmPipelineSnapshots.snapshotVersion),
          asc(crmPipelineSnapshots.sourceRunId),
          asc(crmPipelineSnapshots.createdAt)
        );

      return rows.map(row => ({
        branchId: row.branchId ?? null,
        createdAt: toIso(row.createdAt),
        currencyCode: row.currencyCode,
        pipelineId: row.pipelineId,
        snapshotDate: row.snapshotDate,
        snapshotVersion: row.snapshotVersion,
        sourceRunId: row.sourceRunId ?? null,
        tenantId: row.tenantId,
      }));
    },
  };
}

export const crmForecastSnapshotObservabilityRepository =
  createCrmForecastSnapshotObservabilityRepository();
