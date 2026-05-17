import type {
  CrmPipeline,
  CrmPipelineRepository,
  CrmPipelineStage,
} from '@interdomestik/domain-crm/pipelines/repository';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import { crmPipelines, crmPipelineStages } from '@interdomestik/database/schema';

type CrmPipelineRow = typeof crmPipelines.$inferSelect;
type CrmPipelineStageRow = typeof crmPipelineStages.$inferSelect;
type CrmPipelineWithStagesRow = CrmPipelineRow & {
  stages?: readonly CrmPipelineStageRow[];
};
type CrmPipelineDb = typeof db;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapStage(row: CrmPipelineStageRow): CrmPipelineStage {
  return {
    expectedDurationDays: row.expectedDurationDays ?? null,
    id: row.id,
    isLost: row.isLost,
    isWon: row.isWon,
    name: row.name,
    order: row.order,
    pipelineId: row.pipelineId,
    probability: row.probability,
    tenantId: row.tenantId,
  };
}

function mapPipeline(row: CrmPipelineWithStagesRow): CrmPipeline {
  return {
    archivedAt: toIso(row.archivedAt),
    archivedById: row.archivedById ?? null,
    branchId: row.branchId ?? null,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    id: row.id,
    name: row.name,
    stages: [...(row.stages ?? [])].sort((a, b) => a.order - b.order).map(mapStage),
    tenantId: row.tenantId,
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

function pipelineValues(pipeline: CrmPipeline) {
  return {
    archivedAt: toDate(pipeline.archivedAt ?? null),
    archivedById: pipeline.archivedById ?? null,
    branchId: pipeline.branchId ?? null,
    createdAt: new Date(pipeline.createdAt),
    id: pipeline.id,
    name: pipeline.name,
    tenantId: pipeline.tenantId,
    updatedAt: new Date(pipeline.updatedAt),
  };
}

function stageValues(stage: CrmPipelineStage) {
  return {
    expectedDurationDays: stage.expectedDurationDays ?? null,
    id: stage.id,
    isLost: stage.isLost,
    isWon: stage.isWon,
    name: stage.name,
    order: stage.order,
    pipelineId: stage.pipelineId,
    probability: stage.probability,
    tenantId: stage.tenantId,
  };
}

export function createCrmPipelineRepository(database: CrmPipelineDb = db): CrmPipelineRepository {
  return {
    async createPipeline(params) {
      // db-access-guard: tenant-scoped -- reason: CRM pipeline create writes explicit tenantId from the authorized domain mutation output
      await database.transaction(async tx => {
        await tx.insert(crmPipelines).values(pipelineValues(params.pipeline));
        if (params.pipeline.stages.length > 0) {
          await tx.insert(crmPipelineStages).values(params.pipeline.stages.map(stageValues));
        }
      });
      return params.pipeline;
    },

    async findPipelineById(params) {
      // db-access-guard: tenant-scoped -- reason: CRM pipeline lookup constrains by explicit tenantId and hides archived rows by default
      const row = await database.query.crmPipelines.findFirst({
        where: and(
          eq(crmPipelines.id, params.pipelineId),
          eq(crmPipelines.tenantId, params.tenantId),
          isNull(crmPipelines.archivedAt)
        ),
        with: {
          stages: {
            where: isNull(crmPipelineStages.archivedAt),
            orderBy: [asc(crmPipelineStages.order)],
          },
        },
      });
      return row ? mapPipeline(row) : null;
    },

    async updatePipeline(params) {
      // db-access-guard: tenant-scoped -- reason: CRM pipeline update constrains by pipeline id plus explicit tenantId from domain mutation output
      await database.transaction(async tx => {
        await tx
          .update(crmPipelines)
          .set(pipelineValues(params.pipeline))
          .where(
            and(
              eq(crmPipelines.id, params.pipeline.id),
              eq(crmPipelines.tenantId, params.pipeline.tenantId)
            )
          );

        for (const stage of params.pipeline.stages) {
          await tx
            .insert(crmPipelineStages)
            .values(stageValues(stage))
            .onConflictDoUpdate({
              target: crmPipelineStages.id,
              set: stageValues(stage),
            });
        }
      });
      return params.pipeline;
    },
  };
}

export const crmPipelineRepository = createCrmPipelineRepository();
