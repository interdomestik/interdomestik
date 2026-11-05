import type {
  CrmDealRepository,
  CrmDealWithStageHistory,
} from '@interdomestik/domain-crm/deals/repository';
import { CrmDealRepositoryFailure } from '@interdomestik/domain-crm/deals/repository';
import { and, eq, isNull } from 'drizzle-orm';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { crmDeals, crmDealStageHistory, crmPipelineStages } from '@interdomestik/database/schema';

import {
  legacyMirrorForStage,
  normalizedDealValues,
  requireNormalizedDeal,
  stageHistoryKind,
  stageHistoryValues,
  type CrmPipelineStageRow,
} from './deal-row-mapping';
import { createCrmPipelineRepository } from './pipeline-repository';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import type { CrmTenantExecutor } from './tenant-runner';

async function findStage(
  database: Pick<CrmTenantExecutor, 'query'>,
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

export function createCrmDealRepository(authority: TenantAuthority): CrmDealRepository {
  const pipelines = createCrmPipelineRepository(authority);

  return {
    async createDealWithStageHistory(params): Promise<CrmDealWithStageHistory> {
      const stage = await withTenantAuthority(authority, scoped =>
        findStage(scoped, {
          stageId: params.deal.currentStageId,
          tenantId: params.deal.tenantId,
        })
      );
      const mirror = legacyMirrorForStage(stage, params.deal);

      // db-access-guard: tenant-scoped -- reason: CRM deal create writes explicit tenantId from domain mutation output and appends same-tenant history in one transaction
      const [created] = await withTenantAuthority(authority, scoped =>
        scoped.transaction(async tx => {
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
        })
      );

      const deal = requireNormalizedDeal(created);
      if (!deal) throw new Error('CRM deal create returned a non-normalized row');
      return { deal, history: params.history };
    },

    async findDealById(params) {
      // db-access-guard: tenant-scoped -- reason: CRM deal lookup constrains by explicit tenantId and hides archived rows by default
      const row = await withTenantAuthority(authority, scoped =>
        scoped.query.crmDeals.findFirst({
          where: and(
            eq(crmDeals.id, params.dealId),
            eq(crmDeals.tenantId, params.tenantId),
            isNull(crmDeals.archivedAt)
          ),
        })
      );
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
      const [updated] = await withTenantAuthority(authority, scoped =>
        scoped
          .update(crmDeals)
          .set(normalizedDealValues(params.deal))
          .where(and(eq(crmDeals.id, params.deal.id), eq(crmDeals.tenantId, params.deal.tenantId)))
          .returning()
      );

      const deal = updated ? requireNormalizedDeal(updated) : params.deal;
      if (!deal) throw new Error('CRM deal update returned a non-normalized row');
      return deal;
    },

    async updateDealWithStageHistory(params): Promise<CrmDealWithStageHistory> {
      const stage = await withTenantAuthority(authority, scoped =>
        findStage(scoped, {
          stageId: params.deal.currentStageId,
          tenantId: params.deal.tenantId,
        })
      );
      const mirror = legacyMirrorForStage(stage, params.deal);
      const expectedStage = params.history.fromStageId
        ? eq(crmDeals.currentStageId, params.history.fromStageId)
        : isNull(crmDeals.currentStageId);

      // db-access-guard: tenant-scoped -- reason: CRM deal stage update constrains by tenant and expected current stage before same-transaction history append
      const [updated] = await withTenantAuthority(authority, scoped =>
        scoped.transaction(async tx => {
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
        })
      );

      const deal = requireNormalizedDeal(updated);
      if (!deal) throw new Error('CRM deal stage update returned a non-normalized row');
      return { deal, history: params.history };
    },
  };
}
