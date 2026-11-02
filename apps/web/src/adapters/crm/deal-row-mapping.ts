import type { CrmDeal, CrmDealStageHistory } from '@interdomestik/domain-crm/deals/repository';
import { CrmDealRepositoryFailure } from '@interdomestik/domain-crm/deals/repository';

import type { crmDeals, crmPipelineStages } from '@interdomestik/database/schema';

type CrmDealRow = typeof crmDeals.$inferSelect;
export type CrmPipelineStageRow = typeof crmPipelineStages.$inferSelect;

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

export function requireNormalizedDeal(row: CrmDealRow): CrmDeal | null {
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

export function normalizedDealValues(deal: CrmDeal) {
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

export function legacyMirrorForStage(stage: CrmPipelineStageRow, deal: CrmDeal): LegacyDealMirror {
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

export function stageHistoryValues(input: {
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

export function stageHistoryKind(
  stage: Pick<CrmPipelineStageRow, 'isLost' | 'isWon'>,
  history: CrmDealStageHistory
): 'lost' | 'reopened' | 'stage_changed' | 'won' {
  if (stage.isWon) return 'won';
  if (stage.isLost) return 'lost';
  if (history.reason?.trim()) return 'reopened';
  return 'stage_changed';
}
