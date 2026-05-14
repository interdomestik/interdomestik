import type {
  CrmAgentLeaderboardRow,
  CrmForecastSnapshotRow,
  CrmFunnelConversionRow,
  CrmReportingBaseInput,
  CrmSourceBreakdownRow,
  CrmStageVelocityRow,
  CrmWeightedPipelineRow,
  CrmWinRateRow,
} from '@interdomestik/domain-crm/reporting';
import type {
  CrmForecastSnapshotRepository,
  CrmPipelineSnapshotRecord,
  CrmReportingRepository,
} from '@interdomestik/domain-crm/reporting/repository';
import { and, asc, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '@interdomestik/database/db';
import {
  crmDeals,
  crmDealStageHistory,
  crmLeads,
  crmPipelines,
  crmPipelineSnapshots,
  crmPipelineStages,
} from '@interdomestik/database/schema';

const defaultForecastSnapshotIds = {
  pipelineSnapshotId: () => randomUUID(),
};

type CrmReportingDb = typeof db;
type SnapshotRow = typeof crmPipelineSnapshots.$inferSelect;

type WeightedRow = {
  agentId: string;
  archivedAt: Date | null;
  branchId: string | null;
  currencyCode: string | null;
  currentStageId: string | null;
  dealId: string;
  forecastCategory: string | null;
  isLostStage: boolean | null;
  isWonStage: boolean | null;
  lossReasonId: string | null;
  pipelineId: string | null;
  source: string | null;
  stageProbability: number | null;
  tenantId: string;
  utmCampaign: string | null;
  utmMedium: string | null;
  utmSource: string | null;
  valueAmountMinor: number | null;
};

type StageIntervalRow = {
  branchId: string | null;
  dealId: string;
  enteredAt: Date;
  kind: 'created' | 'lost' | 'reopened' | 'stage_changed' | 'won';
  lossReasonId: string | null;
  pipelineId: string;
  stageId: string;
  stageIsLost: boolean;
  stageIsWon: boolean;
  tenantId: string;
};

function toDate(value: string): Date {
  return new Date(value);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function actorScope(input: CrmReportingBaseInput) {
  const actor = input.actor;
  const predicates = [eq(crmDeals.tenantId, actor.tenantId)];

  if (actor.role === 'agent') {
    predicates.push(eq(crmDeals.agentId, actor.scope.agentId ?? actor.actorId));
  } else if (actor.role === 'branch_manager') {
    if (!actor.scope.branchId) return sql`false`;
    predicates.push(eq(crmDeals.branchId, actor.scope.branchId));
  }

  return and(...predicates);
}

function snapshotScope(params: {
  branchId?: string | null;
  pipelineId?: string | null;
  snapshotDate: string;
  tenantId: string;
}) {
  const predicates = [
    eq(crmPipelineSnapshots.tenantId, params.tenantId),
    eq(crmPipelineSnapshots.snapshotDate, params.snapshotDate),
  ];
  if (params.pipelineId) predicates.push(eq(crmPipelineSnapshots.pipelineId, params.pipelineId));
  if (params.branchId === null) predicates.push(isNull(crmPipelineSnapshots.branchId));
  else if (params.branchId) predicates.push(eq(crmPipelineSnapshots.branchId, params.branchId));
  return and(...predicates);
}

function weightedSelect() {
  return {
    agentId: crmDeals.agentId,
    archivedAt: crmDeals.archivedAt,
    branchId: crmDeals.branchId,
    currencyCode: crmDeals.currencyCode,
    currentStageId: crmDeals.currentStageId,
    dealId: crmDeals.id,
    forecastCategory: crmDeals.forecastCategory,
    isLostStage: crmPipelineStages.isLost,
    isWonStage: crmPipelineStages.isWon,
    lossReasonId: crmDeals.lossReasonId,
    pipelineId: crmDeals.pipelineId,
    source: crmLeads.source,
    stageProbability: crmPipelineStages.probability,
    tenantId: crmDeals.tenantId,
    utmCampaign: crmLeads.utmCampaign,
    utmMedium: crmLeads.utmMedium,
    utmSource: crmLeads.utmSource,
    valueAmountMinor: crmDeals.valueAmountMinor,
  };
}

function mapWeighted(row: WeightedRow): CrmWeightedPipelineRow {
  return {
    agentId: row.agentId,
    archivedAt: toIso(row.archivedAt),
    branchId: row.branchId,
    currencyCode: row.currencyCode,
    currentStageId: row.currentStageId,
    dealId: row.dealId,
    forecastCategory:
      row.forecastCategory === 'best' ||
      row.forecastCategory === 'closed' ||
      row.forecastCategory === 'commit' ||
      row.forecastCategory === 'omitted' ||
      row.forecastCategory === 'pipeline'
        ? row.forecastCategory
        : null,
    isLostStage: row.isLostStage ?? false,
    isWonStage: row.isWonStage ?? false,
    lossReasonId: row.lossReasonId,
    pipelineId: row.pipelineId,
    source: row.source,
    stageProbability: row.stageProbability,
    tenantId: row.tenantId,
    utmCampaign: row.utmCampaign,
    utmMedium: row.utmMedium,
    utmSource: row.utmSource,
    valueAmountMinor: row.valueAmountMinor,
  };
}

function outcomeFor(row: CrmWeightedPipelineRow): 'lost' | 'open' | 'won' {
  if (row.isWonStage) return 'won';
  if (row.isLostStage) return 'lost';
  return 'open';
}

async function listWeightedRows(
  database: CrmReportingDb,
  input: CrmReportingBaseInput
): Promise<CrmWeightedPipelineRow[]> {
  const predicates = [
    actorScope(input),
    gte(crmDeals.createdAt, toDate(input.window.from)),
    lt(crmDeals.createdAt, toDate(input.window.to)),
  ];
  if (!input.includeArchived) {
    predicates.push(
      isNull(crmDeals.archivedAt),
      isNull(crmPipelines.archivedAt),
      isNull(crmPipelineStages.archivedAt)
    );
  }

  // db-access-guard: tenant-scoped -- reason: CRM reporting weighted rows constrain deals by authorized actor tenant plus agent or branch scope
  const rows = await database
    .select(weightedSelect())
    .from(crmDeals)
    .leftJoin(
      crmPipelines,
      and(eq(crmPipelines.tenantId, crmDeals.tenantId), eq(crmPipelines.id, crmDeals.pipelineId))
    )
    .leftJoin(
      crmPipelineStages,
      and(
        eq(crmPipelineStages.tenantId, crmDeals.tenantId),
        eq(crmPipelineStages.id, crmDeals.currentStageId)
      )
    )
    .leftJoin(
      crmLeads,
      and(eq(crmLeads.tenantId, crmDeals.tenantId), eq(crmLeads.id, crmDeals.leadId))
    )
    .where(and(...predicates));

  return rows.map(mapWeighted);
}

async function listStageIntervalRows(
  database: CrmReportingDb,
  input: CrmReportingBaseInput
): Promise<(StageIntervalRow & { exitedAt: string | null })[]> {
  const predicates = [
    actorScope(input),
    gte(crmDealStageHistory.occurredAt, toDate(input.window.from)),
    lt(crmDealStageHistory.occurredAt, toDate(input.window.to)),
  ];
  if (!input.includeArchived) {
    predicates.push(
      isNull(crmDeals.archivedAt),
      isNull(crmPipelines.archivedAt),
      isNull(crmPipelineStages.archivedAt)
    );
  }

  // db-access-guard: tenant-scoped -- reason: CRM reporting stage-history rows join through tenant-scoped deals constrained by authorized actor scope
  const rows = await database
    .select({
      branchId: crmDeals.branchId,
      dealId: crmDealStageHistory.dealId,
      enteredAt: crmDealStageHistory.occurredAt,
      historyId: crmDealStageHistory.id,
      kind: crmDealStageHistory.kind,
      lossReasonId: crmDealStageHistory.lossReasonId,
      pipelineId: crmDealStageHistory.pipelineId,
      stageId: crmDealStageHistory.toStageId,
      stageIsLost: crmPipelineStages.isLost,
      stageIsWon: crmPipelineStages.isWon,
      tenantId: crmDealStageHistory.tenantId,
    })
    .from(crmDealStageHistory)
    .innerJoin(
      crmDeals,
      and(
        eq(crmDeals.tenantId, crmDealStageHistory.tenantId),
        eq(crmDeals.id, crmDealStageHistory.dealId)
      )
    )
    .innerJoin(
      crmPipelines,
      and(
        eq(crmPipelines.tenantId, crmDealStageHistory.tenantId),
        eq(crmPipelines.id, crmDealStageHistory.pipelineId)
      )
    )
    .innerJoin(
      crmPipelineStages,
      and(
        eq(crmPipelineStages.tenantId, crmDealStageHistory.tenantId),
        eq(crmPipelineStages.id, crmDealStageHistory.toStageId)
      )
    )
    .where(and(...predicates))
    .orderBy(
      asc(crmDealStageHistory.dealId),
      asc(crmDealStageHistory.occurredAt),
      asc(crmDealStageHistory.createdAt),
      asc(crmDealStageHistory.id)
    );

  return rows.map((row, index) => {
    const next = rows[index + 1];
    const exitedAt = next?.dealId === row.dealId ? toIso(next.enteredAt) : null;
    return {
      branchId: row.branchId,
      dealId: row.dealId,
      enteredAt: row.enteredAt,
      exitedAt,
      kind: row.kind as StageIntervalRow['kind'],
      lossReasonId: row.lossReasonId,
      pipelineId: row.pipelineId,
      stageId: row.stageId,
      stageIsLost: row.stageIsLost,
      stageIsWon: row.stageIsWon,
      tenantId: row.tenantId,
    };
  });
}

function mapSnapshotRecord(row: SnapshotRow): CrmPipelineSnapshotRecord {
  return {
    branchId: row.branchId,
    closedLostAmountMinor: row.closedLostAmountMinor,
    closedWonAmountMinor: row.closedWonAmountMinor,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    currencyCode: row.currencyCode,
    forecastBestAmountMinor: row.forecastBestAmountMinor,
    forecastCommitAmountMinor: row.forecastCommitAmountMinor,
    forecastOmittedAmountMinor: row.forecastOmittedAmountMinor,
    forecastPipelineAmountMinor: row.forecastPipelineAmountMinor,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    openDealCount: row.openDealCount,
    pipelineId: row.pipelineId,
    rawValueAmountMinor: row.rawValueAmountMinor,
    snapshotDate: row.snapshotDate,
    snapshotVersion: row.snapshotVersion,
    sourceRunId: row.sourceRunId,
    tenantId: row.tenantId,
    weightedValueAmountMinor: row.weightedValueAmountMinor,
  };
}

function snapshotInsertValues(
  snapshot: CrmForecastSnapshotRow,
  params: { id: string; snapshotVersion: number }
) {
  return {
    branchId: snapshot.branchId ?? null,
    closedLostAmountMinor: snapshot.closedLostAmountMinor,
    closedWonAmountMinor: snapshot.closedWonAmountMinor,
    createdAt: new Date(snapshot.createdAt),
    createdById: snapshot.createdById ?? null,
    currencyCode: snapshot.currencyCode,
    forecastBestAmountMinor: snapshot.forecastBestAmountMinor,
    forecastCommitAmountMinor: snapshot.forecastCommitAmountMinor,
    forecastOmittedAmountMinor: snapshot.forecastOmittedAmountMinor,
    forecastPipelineAmountMinor: snapshot.forecastPipelineAmountMinor,
    id: params.id,
    idempotencyKey: snapshot.idempotencyKey ?? null,
    metadata: null,
    openDealCount: snapshot.openDealCount,
    pipelineId: snapshot.pipelineId,
    rawValueAmountMinor: snapshot.rawValueAmountMinor,
    snapshotDate: snapshot.snapshotDate,
    snapshotVersion: params.snapshotVersion,
    sourceRunId: snapshot.sourceRunId ?? null,
    tenantId: snapshot.tenantId,
    weightedValueAmountMinor: snapshot.weightedValueAmountMinor,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

function snapshotKey(snapshot: CrmForecastSnapshotRow): string {
  return [
    snapshot.tenantId,
    snapshot.pipelineId,
    snapshot.branchId ?? '',
    snapshot.currencyCode,
    snapshot.snapshotDate,
  ].join('\u001f');
}

function hasDuplicateSnapshotKeys(snapshots: readonly CrmForecastSnapshotRow[]): boolean {
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    const key = snapshotKey(snapshot);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function createCrmReportingRepository(
  database: CrmReportingDb = db
): CrmReportingRepository {
  return {
    async listAgentLeaderboardRows(input) {
      const rows = await listWeightedRows(database, input);
      return rows.map(
        (row): CrmAgentLeaderboardRow => ({
          ...row,
          activityCount: 1,
          outcome: outcomeFor(row),
        })
      );
    },

    async listFunnelConversionRows(input) {
      const rows = await listStageIntervalRows(database, input);
      return rows.map(
        (row): CrmFunnelConversionRow => ({
          branchId: row.branchId,
          dealId: row.dealId,
          enteredAt: row.enteredAt.toISOString(),
          exitedAt: row.exitedAt,
          kind: row.kind,
          lossReasonId: row.lossReasonId,
          pipelineId: row.pipelineId,
          stageId: row.stageId,
          stageIsLost: row.stageIsLost,
          stageIsWon: row.stageIsWon,
          tenantId: row.tenantId,
        })
      );
    },

    async listSourceBreakdownRows(input) {
      const rows = await listWeightedRows(database, input);
      return rows.map((row): CrmSourceBreakdownRow => ({ ...row, outcome: outcomeFor(row) }));
    },

    async listStageVelocityRows(input) {
      const rows = await listStageIntervalRows(database, input);
      return rows.map(
        (row): CrmStageVelocityRow => ({
          branchId: row.branchId,
          dealId: row.dealId,
          enteredAt: row.enteredAt.toISOString(),
          exitedAt: row.exitedAt,
          kind: row.kind,
          pipelineId: row.pipelineId,
          stageId: row.stageId,
          tenantId: row.tenantId,
        })
      );
    },

    async listWeightedPipelineRows(input) {
      return listWeightedRows(database, input);
    },

    async listWinRateRows(input) {
      const rows = await listWeightedRows(database, input);
      return rows.map(
        (row): CrmWinRateRow => ({
          agentId: row.agentId,
          branchId: row.branchId,
          outcome: outcomeFor(row),
          pipelineId: row.pipelineId,
          source: row.source,
          stageId: row.currentStageId,
          lossReasonId: row.lossReasonId,
          tenantId: row.tenantId,
        })
      );
    },
  };
}

export function createCrmForecastSnapshotRepository(
  database: CrmReportingDb = db,
  ids: { pipelineSnapshotId: () => string } = defaultForecastSnapshotIds
): CrmForecastSnapshotRepository {
  return {
    async insertPipelineSnapshots(params) {
      if (hasDuplicateSnapshotKeys(params.snapshots)) {
        return { success: false, reason: 'version_conflict' };
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          // db-access-guard: tenant-scoped -- reason: CRM forecast snapshot insert derives version numbers from explicit tenant/pipeline snapshot keys and writes those same tenant ids
          const inserted = await database.transaction(async tx => {
            const values = [];
            for (const snapshot of params.snapshots) {
              const [latest] = await tx
                .select({
                  version: sql<number>`coalesce(max(${crmPipelineSnapshots.snapshotVersion}), 0)`,
                })
                .from(crmPipelineSnapshots)
                .where(
                  and(
                    eq(crmPipelineSnapshots.tenantId, snapshot.tenantId),
                    eq(crmPipelineSnapshots.pipelineId, snapshot.pipelineId),
                    snapshot.branchId
                      ? eq(crmPipelineSnapshots.branchId, snapshot.branchId)
                      : isNull(crmPipelineSnapshots.branchId),
                    eq(crmPipelineSnapshots.currencyCode, snapshot.currencyCode),
                    eq(crmPipelineSnapshots.snapshotDate, snapshot.snapshotDate)
                  )
                );

              values.push(
                snapshotInsertValues(snapshot, {
                  id: ids.pipelineSnapshotId(),
                  snapshotVersion: (latest?.version ?? 0) + 1,
                })
              );
            }

            if (values.length === 0) return [];
            return tx.insert(crmPipelineSnapshots).values(values).returning();
          });

          return { success: true, snapshots: inserted.map(mapSnapshotRecord) };
        } catch (error) {
          if (!isUniqueConflict(error)) throw error;
        }
      }

      return { success: false, reason: 'version_conflict' };
    },

    async listLatestPipelineSnapshots(params) {
      // db-access-guard: tenant-scoped -- reason: CRM forecast snapshot reads constrain by explicit tenant id and optional branch/pipeline scope
      const rows = await database
        .select()
        .from(crmPipelineSnapshots)
        .where(snapshotScope(params))
        .orderBy(
          asc(crmPipelineSnapshots.pipelineId),
          asc(crmPipelineSnapshots.branchId),
          asc(crmPipelineSnapshots.currencyCode),
          desc(crmPipelineSnapshots.snapshotVersion)
        );

      const latest = new Map<string, SnapshotRow>();
      for (const row of rows) {
        const key = [row.pipelineId, row.branchId ?? '', row.currencyCode].join('\u001f');
        if (!latest.has(key)) latest.set(key, row);
      }
      return [...latest.values()].map(mapSnapshotRecord);
    },
  };
}

export const crmReportingRepository = createCrmReportingRepository();
export const crmForecastSnapshotRepository = createCrmForecastSnapshotRepository();
