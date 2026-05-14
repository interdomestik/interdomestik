import type {
  CrmDeal,
  CrmDealRepository,
  CrmDealStageHistory,
  CrmDealWithStageHistory,
} from '@interdomestik/domain-crm/deals/repository';
import { CrmDealRepositoryFailure } from '@interdomestik/domain-crm/deals/repository';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import { crmDeals, crmDealStageHistory, crmPipelineStages } from '@interdomestik/database/schema';

import { createCrmPipelineRepository } from './pipeline-repository';

type CrmDealDb = typeof db;
type CrmDealRow = typeof crmDeals.$inferSelect;
type CrmPipelineStageRow = typeof crmPipelineStages.$inferSelect;

type LegacyDealMirror = {
  closedAt: Date | null;
  stage: 'closed_lost' | 'closed_won' | 'negotiation' | 'proposal';
  status: 'lost' | 'open' | 'won';
  valueCents: number;
};

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function requireNormalizedDeal(row: CrmDealRow): CrmDeal | null {
  if (
    !row.accountId ||
    !row.branchId ||
    !row.currentStageId ||
    !row.currencyCode ||
    !row.forecastCategory ||
    !row.pipelineId ||
    row.valueAmountMinor == null
  ) {
    return null;
  }

  if (
    row.forecastCategory !== 'pipeline' &&
    row.forecastCategory !== 'best' &&
    row.forecastCategory !== 'commit' &&
    row.forecastCategory !== 'omitted' &&
    row.forecastCategory !== 'closed'
  ) {
    return null;
  }

  return {
    accountId: row.accountId,
    agentId: row.agentId,
    archivedAt: toIso(row.archivedAt),
    archivedById: row.archivedById ?? null,
    branchId: row.branchId,
    closedAt: toIso(row.closedAt),
    contactId: row.contactId ?? null,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    currencyCode: row.currencyCode,
    currentStageId: row.currentStageId,
    expectedCloseAt: toIso(row.expectedCloseAt),
    forecastCategory: row.forecastCategory,
    id: row.id,
    lossReasonId: row.lossReasonId ?? null,
    pipelineId: row.pipelineId,
    tenantId: row.tenantId,
    updatedAt: toIso(row.updatedAt) ?? toIso(row.createdAt) ?? new Date(0).toISOString(),
    valueAmountMinor: row.valueAmountMinor,
  };
}

function normalizedDealValues(deal: CrmDeal) {
  return {
    accountId: deal.accountId,
    agentId: deal.agentId,
    archivedAt: toDate(deal.archivedAt ?? null),
    archivedById: deal.archivedById ?? null,
    branchId: deal.branchId,
    closedAt: toDate(deal.closedAt ?? null),
    contactId: deal.contactId ?? null,
    currencyCode: deal.currencyCode,
    currentStageId: deal.currentStageId,
    expectedCloseAt: toDate(deal.expectedCloseAt ?? null),
    forecastCategory: deal.forecastCategory,
    id: deal.id,
    lossReasonId: deal.lossReasonId ?? null,
    pipelineId: deal.pipelineId,
    tenantId: deal.tenantId,
    updatedAt: new Date(deal.updatedAt),
    valueAmountMinor: deal.valueAmountMinor,
  };
}

function legacyMirrorForStage(stage: CrmPipelineStageRow, deal: CrmDeal): LegacyDealMirror {
  if (deal.currencyCode !== 'EUR') {
    throw new CrmDealRepositoryFailure('invalid_currency');
  }

  if (stage.isWon) {
    return {
      closedAt: toDate(deal.closedAt ?? deal.updatedAt),
      stage: 'closed_won',
      status: 'won',
      valueCents: deal.valueAmountMinor,
    };
  }

  if (stage.isLost) {
    return {
      closedAt: toDate(deal.closedAt ?? deal.updatedAt),
      stage: 'closed_lost',
      status: 'lost',
      valueCents: deal.valueAmountMinor,
    };
  }

  return {
    closedAt: null,
    stage: stage.name.toLowerCase().includes('negotiation') ? 'negotiation' : 'proposal',
    status: 'open',
    valueCents: deal.valueAmountMinor,
  };
}

function stageHistoryValues(input: {
  deal: CrmDeal;
  history: CrmDealStageHistory;
  kind: 'created' | 'lost' | 'reopened' | 'stage_changed' | 'won';
}) {
  const occurredAt = new Date(input.history.createdAt);
  return {
    actorId: input.history.actorId,
    createdAt: occurredAt,
    dealId: input.history.dealId,
    fromStageId: input.history.fromStageId,
    id: input.history.id,
    kind: input.kind,
    lossReasonId: input.history.lossReasonId ?? null,
    metadata: null,
    occurredAt,
    pipelineId: input.deal.pipelineId,
    reason: input.history.reason ?? null,
    tenantId: input.history.tenantId,
    toStageId: input.history.toStageId,
  };
}

function stageHistoryKind(
  stage: Pick<CrmPipelineStageRow, 'isLost' | 'isWon'>,
  history: CrmDealStageHistory
): 'lost' | 'reopened' | 'stage_changed' | 'won' {
  if (stage.isWon) return 'won';
  if (stage.isLost) return 'lost';
  if (history.reason?.trim()) return 'reopened';
  return 'stage_changed';
}

async function findStage(
  database: Pick<CrmDealDb, 'query'>,
  params: { stageId: string; tenantId: string }
): Promise<CrmPipelineStageRow> {
  // db-access-guard: tenant-scoped -- reason: CRM deal adapter constrains stage lookup by explicit deal tenant before writing mirrors/history
  const stage = await database.query.crmPipelineStages.findFirst({
    where: and(
      eq(crmPipelineStages.id, params.stageId),
      eq(crmPipelineStages.tenantId, params.tenantId),
      isNull(crmPipelineStages.archivedAt)
    ),
  });
  if (!stage) {
    throw new Error(`CRM pipeline stage ${params.stageId} was not available for deal persistence`);
  }
  return stage;
}

export function createCrmDealRepository(database: CrmDealDb = db): CrmDealRepository {
  const pipelines = createCrmPipelineRepository(database);

  return {
    async createDealWithStageHistory(params): Promise<CrmDealWithStageHistory> {
      const stage = await findStage(database, {
        stageId: params.deal.currentStageId,
        tenantId: params.deal.tenantId,
      });
      const mirror = legacyMirrorForStage(stage, params.deal);

      // db-access-guard: tenant-scoped -- reason: CRM deal create writes explicit tenantId from domain mutation output and appends same-tenant history in one transaction
      const [created] = await database.transaction(async tx => {
        const [row] = await tx
          .insert(crmDeals)
          .values({
            ...normalizedDealValues(params.deal),
            closedAt: mirror.closedAt,
            createdAt: new Date(params.deal.createdAt),
            leadId: null,
            stage: mirror.stage,
            status: mirror.status,
            valueCents: mirror.valueCents,
          })
          .returning();

        await tx.insert(crmDealStageHistory).values(
          stageHistoryValues({
            deal: params.deal,
            history: params.history,
            kind: 'created',
          })
        );

        return [row];
      });

      const deal = requireNormalizedDeal(created);
      if (!deal) throw new Error('CRM deal create returned a non-normalized row');
      return { deal, history: params.history };
    },

    async findDealById(params) {
      // db-access-guard: tenant-scoped -- reason: CRM deal lookup constrains by explicit tenantId and hides archived rows by default
      const row = await database.query.crmDeals.findFirst({
        where: and(
          eq(crmDeals.id, params.dealId),
          eq(crmDeals.tenantId, params.tenantId),
          isNull(crmDeals.archivedAt)
        ),
      });
      return row ? requireNormalizedDeal(row) : null;
    },

    async findPipelineById(params) {
      return pipelines.findPipelineById(params);
    },

    async findReferenceSnapshot() {
      // CRM02 account/contact persistence is intentionally outside CRM04. Until those SQL tables
      // exist, domain deal creation remains fail-closed at the reference-validation step.
      return { account: null, contact: null };
    },

    async updateDeal(params) {
      // db-access-guard: tenant-scoped -- reason: CRM deal update constrains by deal id and explicit tenantId from domain mutation output
      const [updated] = await database
        .update(crmDeals)
        .set(normalizedDealValues(params.deal))
        .where(and(eq(crmDeals.id, params.deal.id), eq(crmDeals.tenantId, params.deal.tenantId)))
        .returning();

      const deal = updated ? requireNormalizedDeal(updated) : params.deal;
      if (!deal) throw new Error('CRM deal update returned a non-normalized row');
      return deal;
    },

    async updateDealWithStageHistory(params): Promise<CrmDealWithStageHistory> {
      const stage = await findStage(database, {
        stageId: params.deal.currentStageId,
        tenantId: params.deal.tenantId,
      });
      const mirror = legacyMirrorForStage(stage, params.deal);
      const expectedStage = params.history.fromStageId
        ? eq(crmDeals.currentStageId, params.history.fromStageId)
        : isNull(crmDeals.currentStageId);

      // db-access-guard: tenant-scoped -- reason: CRM deal stage update constrains by tenant and expected current stage before same-transaction history append
      const [updated] = await database.transaction(async tx => {
        const [row] = await tx
          .update(crmDeals)
          .set({
            ...normalizedDealValues(params.deal),
            closedAt: mirror.closedAt,
            stage: mirror.stage,
            status: mirror.status,
            valueCents: mirror.valueCents,
          })
          .where(
            and(
              eq(crmDeals.id, params.deal.id),
              eq(crmDeals.tenantId, params.deal.tenantId),
              expectedStage,
              isNull(crmDeals.archivedAt)
            )
          )
          .returning();

        if (!row) {
          throw new CrmDealRepositoryFailure('stage_drift');
        }

        await tx.insert(crmDealStageHistory).values(
          stageHistoryValues({
            deal: params.deal,
            history: params.history,
            kind: stageHistoryKind(stage, params.history),
          })
        );

        return [row];
      });

      const deal = requireNormalizedDeal(updated);
      if (!deal) throw new Error('CRM deal stage update returned a non-normalized row');
      return { deal, history: params.history };
    },
  };
}

export const crmDealRepository = createCrmDealRepository();
