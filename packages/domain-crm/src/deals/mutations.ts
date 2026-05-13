import { isStaffLikeCrmActor, type CrmActorContext } from '../context';
import type {
  CrmDealCreatedEvent,
  CrmDealLostEvent,
  CrmDealReopenedEvent,
  CrmDealStageChangedEvent,
  CrmDealWonEvent,
} from '../outbox/types';
import type { CrmPipeline, CrmPipelineStage } from '../pipelines/repository';
import type { LossReasonResolver } from './loss-reason';
import type { CrmDealRepository } from './repository';
import {
  CRM_DEAL_FORECAST_CATEGORIES,
  type CrmDeal,
  type CrmDealForecastCategory,
  type CrmDealReferenceSnapshot,
  type CrmDealStageHistory,
} from './types';

export type CrmDealClock = {
  now(): string;
};

export type CrmDealIds = {
  dealId?: () => string;
  dealStageHistoryId(): string;
};

export type CrmDealMutationDenialReason =
  | 'tenant_scope'
  | 'agent_scope'
  | 'branch_scope'
  | 'role_scope';

export type CrmDealValidationReason =
  | 'agent_required'
  | 'archived_deal'
  | 'archived_pipeline'
  | 'archived_reference'
  | 'deal_not_closed'
  | 'invalid_amount'
  | 'invalid_currency'
  | 'invalid_expected_close_at'
  | 'invalid_forecast_category'
  | 'invalid_reopen_reason'
  | 'loss_reason_not_allowed'
  | 'loss_reason_required'
  | 'loss_reason_unknown'
  | 'no_op_transition'
  | 'pipeline_stage_mismatch'
  | 'stage_drift'
  | 'terminal_deal';

export type CreateCrmDealInput = {
  accountId: string;
  actor: CrmActorContext;
  agentId?: string | null;
  contactId?: string | null;
  currencyCode: string;
  expectedCloseAt?: string | null;
  forecastCategory: string;
  idempotencyKey?: string | null;
  pipelineId: string;
  pipelineStageId: string;
  tenantId: string;
  valueAmountMinor: number;
};

export type MoveCrmDealStageInput = {
  actor: CrmActorContext;
  dealId: string;
  fromStageId: string;
  idempotencyKey?: string | null;
  lossReasonId?: string | null;
  toStageId: string;
};

export type ReopenCrmDealInput = {
  actor: CrmActorContext;
  dealId: string;
  fromStageId: string;
  idempotencyKey?: string | null;
  reopenReason: string;
  toStageId: string;
};

export type WinCrmDealInput = Omit<MoveCrmDealStageInput, 'lossReasonId'>;

export type LoseCrmDealInput = MoveCrmDealStageInput & {
  lossReasonId: string;
};

export type ArchiveCrmDealInput = {
  actor: CrmActorContext;
  dealId: string;
};

export type CreateCrmDealResult =
  | { success: true; deal: CrmDeal; event: CrmDealCreatedEvent; history: CrmDealStageHistory }
  | { success: false; error: 'forbidden'; reason: CrmDealMutationDenialReason }
  | { success: false; error: 'invalid_input'; reason: CrmDealValidationReason }
  | { success: false; error: 'not_found' };

export type MoveCrmDealStageResult =
  | {
      success: true;
      deal: CrmDeal;
      event: CrmDealLostEvent | CrmDealStageChangedEvent | CrmDealWonEvent;
      history: CrmDealStageHistory;
    }
  | { success: false; error: 'forbidden'; reason: CrmDealMutationDenialReason }
  | { success: false; error: 'invalid_input'; reason: CrmDealValidationReason }
  | { success: false; error: 'not_found' };

export type ReopenCrmDealResult =
  | { success: true; deal: CrmDeal; event: CrmDealReopenedEvent; history: CrmDealStageHistory }
  | { success: false; error: 'forbidden'; reason: CrmDealMutationDenialReason }
  | { success: false; error: 'invalid_input'; reason: CrmDealValidationReason }
  | { success: false; error: 'not_found' };

export type ArchiveCrmDealResult =
  | { success: true; deal: CrmDeal }
  | { success: false; error: 'forbidden'; reason: CrmDealMutationDenialReason }
  | { success: false; error: 'not_found' };

function isForecastCategory(value: string): value is CrmDealForecastCategory {
  return CRM_DEAL_FORECAST_CATEGORIES.includes(value as CrmDealForecastCategory);
}

function isParseableDate(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

function findStage(pipeline: CrmPipeline, stageId: string): CrmPipelineStage | null {
  return pipeline.stages.find(stage => stage.id === stageId) ?? null;
}

function isTerminalStage(stage: Pick<CrmPipelineStage, 'isLost' | 'isWon'>): boolean {
  return stage.isLost || stage.isWon;
}

function validateMoney(input: {
  currencyCode: string;
  valueAmountMinor: number;
}): CrmDealValidationReason | null {
  if (!/^[A-Z]{3}$/.test(input.currencyCode)) return 'invalid_currency';
  if (!Number.isInteger(input.valueAmountMinor) || input.valueAmountMinor < 0) {
    return 'invalid_amount';
  }
  return null;
}

function validateForecast(
  forecastCategory: string,
  stage: Pick<CrmPipelineStage, 'isLost' | 'isWon'>
): CrmDealForecastCategory | 'invalid_forecast_category' {
  if (!isForecastCategory(forecastCategory)) return 'invalid_forecast_category';
  if (isTerminalStage(stage) && forecastCategory !== 'closed') return 'invalid_forecast_category';
  if (!isTerminalStage(stage) && forecastCategory === 'closed') return 'invalid_forecast_category';
  return forecastCategory;
}

function authorizeCreate(
  actor: CrmActorContext,
  tenantId: string,
  branchId: string,
  agentId: string
): CrmDealMutationDenialReason | null {
  if (actor.tenantId !== tenantId) return 'tenant_scope';
  if (actor.role === 'admin') return null;
  if (!actor.scope.branchId || actor.scope.branchId !== branchId) return 'branch_scope';
  if (actor.role === 'agent') {
    if (agentId !== actor.actorId) return 'agent_scope';
    if (actor.scope.agentId && actor.scope.agentId !== actor.actorId) return 'agent_scope';
    return null;
  }
  if (isStaffLikeCrmActor(actor)) return null;
  return 'role_scope';
}

function authorizeExistingDeal(
  actor: CrmActorContext,
  deal: Pick<CrmDeal, 'agentId' | 'branchId' | 'tenantId'>
): CrmDealMutationDenialReason | null {
  if (actor.tenantId !== deal.tenantId) return 'tenant_scope';
  if (actor.role === 'admin') return null;
  if (!actor.scope.branchId || actor.scope.branchId !== deal.branchId) return 'branch_scope';
  if (actor.role === 'agent') {
    if (deal.agentId !== actor.actorId) return 'agent_scope';
    if (actor.scope.agentId && actor.scope.agentId !== actor.actorId) return 'agent_scope';
    return null;
  }
  if (isStaffLikeCrmActor(actor)) return null;
  return 'role_scope';
}

function authorizeReopen(
  actor: CrmActorContext,
  deal: CrmDeal
): CrmDealMutationDenialReason | null {
  if (actor.tenantId !== deal.tenantId) return 'tenant_scope';
  if (actor.role === 'admin') return null;
  if (actor.role !== 'branch_manager') return 'role_scope';
  if (!actor.scope.branchId || actor.scope.branchId !== deal.branchId) return 'branch_scope';
  return null;
}

function validateReferences(
  references: CrmDealReferenceSnapshot,
  input: { accountId: string; branchId: string; contactId?: string | null; tenantId: string }
): CrmDealMutationDenialReason | 'archived_reference' | 'not_found' | null {
  if (!references.account || references.account.id !== input.accountId) return 'not_found';
  if (references.account.tenantId !== input.tenantId) return 'tenant_scope';
  if (references.account.branchId !== input.branchId) return 'branch_scope';
  if (references.account.archivedAt) return 'archived_reference';
  if (input.contactId != null) {
    if (!references.contact || references.contact.id !== input.contactId) return 'not_found';
    if (references.contact.tenantId !== input.tenantId) return 'tenant_scope';
    if (references.contact.branchId !== input.branchId) return 'branch_scope';
    if (references.contact.archivedAt) return 'archived_reference';
  }
  return null;
}

function createStageHistory(input: {
  actor: CrmActorContext;
  dealId: string;
  fromStageId: string | null;
  ids: CrmDealIds;
  lossReasonId?: string | null;
  now: string;
  reason?: string | null;
  tenantId: string;
  toStageId: string;
}): CrmDealStageHistory {
  return {
    actorId: input.actor.actorId,
    createdAt: input.now,
    dealId: input.dealId,
    fromStageId: input.fromStageId,
    id: input.ids.dealStageHistoryId(),
    lossReasonId: input.lossReasonId ?? null,
    reason: input.reason ?? null,
    tenantId: input.tenantId,
    toStageId: input.toStageId,
  };
}

function eventActor(actor: CrmActorContext) {
  return {
    actorId: actor.actorId,
    branchId: actor.scope.branchId ?? null,
    role: actor.role,
    tenantId: actor.tenantId,
  };
}

export async function createCrmDeal(
  input: CreateCrmDealInput,
  repository: Pick<
    CrmDealRepository,
    'createDealWithStageHistory' | 'findPipelineById' | 'findReferenceSnapshot'
  >,
  services: {
    clock: CrmDealClock;
    ids: Required<Pick<CrmDealIds, 'dealId'>> & Pick<CrmDealIds, 'dealStageHistoryId'>;
  }
): Promise<CreateCrmDealResult> {
  const pipeline = await repository.findPipelineById({
    pipelineId: input.pipelineId,
    tenantId: input.tenantId,
  });
  if (!pipeline) return { success: false, error: 'not_found' };
  if (pipeline.tenantId !== input.tenantId) {
    return { success: false, error: 'forbidden', reason: 'tenant_scope' };
  }
  if (pipeline.archivedAt) {
    return { success: false, error: 'invalid_input', reason: 'archived_pipeline' };
  }
  const stage = findStage(pipeline, input.pipelineStageId);
  if (!stage) return { success: false, error: 'invalid_input', reason: 'pipeline_stage_mismatch' };
  if (stage.isLost) {
    return { success: false, error: 'invalid_input', reason: 'loss_reason_required' };
  }
  const moneyError = validateMoney(input);
  if (moneyError) return { success: false, error: 'invalid_input', reason: moneyError };
  if (input.expectedCloseAt && !isParseableDate(input.expectedCloseAt)) {
    return { success: false, error: 'invalid_input', reason: 'invalid_expected_close_at' };
  }
  const forecastCategory = validateForecast(input.forecastCategory, stage);
  if (forecastCategory === 'invalid_forecast_category') {
    return { success: false, error: 'invalid_input', reason: forecastCategory };
  }

  const branchId = pipeline.branchId || input.actor.scope.branchId;
  if (!branchId) return { success: false, error: 'forbidden', reason: 'branch_scope' };
  const requestedAgentId = input.agentId?.trim() || null;
  if (input.actor.role !== 'agent' && !requestedAgentId) {
    return { success: false, error: 'invalid_input', reason: 'agent_required' };
  }
  const agentId = requestedAgentId ?? input.actor.actorId;
  const denied = authorizeCreate(input.actor, input.tenantId, branchId, agentId);
  if (denied) return { success: false, error: 'forbidden', reason: denied };
  const contactId = input.contactId?.trim() || null;

  const references = await repository.findReferenceSnapshot({
    accountId: input.accountId,
    contactId,
    tenantId: input.tenantId,
  });
  const referenceError = validateReferences(references, {
    accountId: input.accountId,
    branchId,
    contactId,
    tenantId: input.tenantId,
  });
  if (referenceError === 'not_found') return { success: false, error: 'not_found' };
  if (referenceError === 'archived_reference') {
    return { success: false, error: 'invalid_input', reason: referenceError };
  }
  if (referenceError) return { success: false, error: 'forbidden', reason: referenceError };

  const now = services.clock.now();
  const deal: CrmDeal = {
    accountId: input.accountId,
    agentId,
    archivedAt: null,
    archivedById: null,
    branchId,
    closedAt: isTerminalStage(stage) ? now : null,
    contactId,
    createdAt: now,
    currencyCode: input.currencyCode,
    currentStageId: input.pipelineStageId,
    expectedCloseAt: input.expectedCloseAt ?? null,
    forecastCategory,
    id: services.ids.dealId(),
    lossReasonId: null,
    pipelineId: input.pipelineId,
    tenantId: input.tenantId,
    updatedAt: now,
    valueAmountMinor: input.valueAmountMinor,
  };
  const history = createStageHistory({
    actor: input.actor,
    dealId: deal.id,
    fromStageId: null,
    ids: services.ids,
    now,
    tenantId: deal.tenantId,
    toStageId: deal.currentStageId,
  });
  const { deal: created, history: appended } = await repository.createDealWithStageHistory({
    deal,
    history,
  });

  return {
    deal: created,
    event: {
      actor: eventActor(input.actor),
      aggregateId: created.id,
      aggregateType: 'deal',
      idempotencyKey: input.idempotencyKey?.trim() || null,
      occurredAt: now,
      payload: {
        accountId: created.accountId,
        agentId: created.agentId,
        branchId: created.branchId,
        contactId: created.contactId ?? null,
        currencyCode: created.currencyCode,
        dealId: created.id,
        expectedCloseAt: created.expectedCloseAt ?? null,
        forecastCategory: created.forecastCategory,
        pipelineId: created.pipelineId,
        pipelineStageId: created.currentStageId,
        valueAmountMinor: created.valueAmountMinor,
      },
      tenantId: created.tenantId,
      type: 'crm.deal.created',
    },
    history: appended,
    success: true,
  };
}

export async function moveCrmDealStage(
  input: MoveCrmDealStageInput,
  repository: Pick<
    CrmDealRepository,
    'findDealById' | 'findPipelineById' | 'updateDealWithStageHistory'
  >,
  lossReasons: LossReasonResolver,
  services: { clock: CrmDealClock; ids: Pick<CrmDealIds, 'dealStageHistoryId'> }
): Promise<MoveCrmDealStageResult> {
  return moveCrmDealStageCore(input, repository, lossReasons, services);
}

async function moveCrmDealStageCore(
  input: MoveCrmDealStageInput,
  repository: Pick<
    CrmDealRepository,
    'findDealById' | 'findPipelineById' | 'updateDealWithStageHistory'
  >,
  lossReasons: LossReasonResolver,
  services: { clock: CrmDealClock; ids: Pick<CrmDealIds, 'dealStageHistoryId'> },
  options: { expectedTerminalStage?: 'lost' | 'won' } = {}
): Promise<MoveCrmDealStageResult> {
  const deal = await repository.findDealById({
    dealId: input.dealId,
    tenantId: input.actor.tenantId,
  });
  if (!deal) return { success: false, error: 'not_found' };
  const denied = authorizeExistingDeal(input.actor, deal);
  if (denied) return { success: false, error: 'forbidden', reason: denied };
  if (deal.archivedAt) return { success: false, error: 'invalid_input', reason: 'archived_deal' };
  if (deal.currentStageId !== input.fromStageId) {
    return { success: false, error: 'invalid_input', reason: 'stage_drift' };
  }
  if (deal.closedAt || deal.forecastCategory === 'closed') {
    return { success: false, error: 'invalid_input', reason: 'terminal_deal' };
  }

  const pipeline = await repository.findPipelineById({
    pipelineId: deal.pipelineId,
    tenantId: deal.tenantId,
  });
  if (!pipeline) return { success: false, error: 'not_found' };
  const toStage = findStage(pipeline, input.toStageId);
  if (!toStage)
    return { success: false, error: 'invalid_input', reason: 'pipeline_stage_mismatch' };
  if (toStage.id === deal.currentStageId) {
    return { success: false, error: 'invalid_input', reason: 'no_op_transition' };
  }
  if (options.expectedTerminalStage === 'won' && !toStage.isWon) {
    return { success: false, error: 'invalid_input', reason: 'pipeline_stage_mismatch' };
  }
  if (options.expectedTerminalStage === 'lost' && !toStage.isLost) {
    return { success: false, error: 'invalid_input', reason: 'pipeline_stage_mismatch' };
  }

  const now = services.clock.now();
  let lossReasonId: string | null = null;
  if (toStage.isLost) {
    const requestedLossReasonId = input.lossReasonId?.trim();
    if (!requestedLossReasonId) {
      return { success: false, error: 'invalid_input', reason: 'loss_reason_required' };
    }
    const lossReason = await lossReasons.resolveLossReason({
      actor: input.actor,
      lossReasonId: requestedLossReasonId,
    });
    if (!lossReason)
      return { success: false, error: 'invalid_input', reason: 'loss_reason_unknown' };
    lossReasonId = lossReason.id;
  } else if (input.lossReasonId?.trim()) {
    return { success: false, error: 'invalid_input', reason: 'loss_reason_not_allowed' };
  }

  const updated: CrmDeal = {
    ...deal,
    closedAt: isTerminalStage(toStage) ? now : null,
    currentStageId: toStage.id,
    forecastCategory: isTerminalStage(toStage) ? 'closed' : deal.forecastCategory,
    lossReasonId,
    updatedAt: now,
  };
  const history = createStageHistory({
    actor: input.actor,
    dealId: deal.id,
    fromStageId: input.fromStageId,
    ids: services.ids,
    lossReasonId,
    now,
    tenantId: deal.tenantId,
    toStageId: toStage.id,
  });
  const { deal: saved, history: appended } = await repository.updateDealWithStageHistory({
    deal: updated,
    history,
  });

  const event = createTransitionEvent(input.actor, saved, deal.currentStageId, toStage, now, {
    idempotencyKey: input.idempotencyKey,
    lossReasonId,
  });
  return { deal: saved, event, history: appended, success: true };
}

export async function winCrmDeal(
  input: WinCrmDealInput,
  repository: Pick<
    CrmDealRepository,
    'findDealById' | 'findPipelineById' | 'updateDealWithStageHistory'
  >,
  lossReasons: LossReasonResolver,
  services: { clock: CrmDealClock; ids: Pick<CrmDealIds, 'dealStageHistoryId'> }
): Promise<MoveCrmDealStageResult> {
  return moveCrmDealStageCore(input, repository, lossReasons, services, {
    expectedTerminalStage: 'won',
  });
}

export async function loseCrmDeal(
  input: LoseCrmDealInput,
  repository: Pick<
    CrmDealRepository,
    'findDealById' | 'findPipelineById' | 'updateDealWithStageHistory'
  >,
  lossReasons: LossReasonResolver,
  services: { clock: CrmDealClock; ids: Pick<CrmDealIds, 'dealStageHistoryId'> }
): Promise<MoveCrmDealStageResult> {
  return moveCrmDealStageCore(input, repository, lossReasons, services, {
    expectedTerminalStage: 'lost',
  });
}

export async function reopenCrmDeal(
  input: ReopenCrmDealInput,
  repository: Pick<
    CrmDealRepository,
    'findDealById' | 'findPipelineById' | 'updateDealWithStageHistory'
  >,
  services: { clock: CrmDealClock; ids: Pick<CrmDealIds, 'dealStageHistoryId'> }
): Promise<ReopenCrmDealResult> {
  const deal = await repository.findDealById({
    dealId: input.dealId,
    tenantId: input.actor.tenantId,
  });
  if (!deal) return { success: false, error: 'not_found' };
  const denied = authorizeReopen(input.actor, deal);
  if (denied) return { success: false, error: 'forbidden', reason: denied };
  if (deal.archivedAt) return { success: false, error: 'invalid_input', reason: 'archived_deal' };
  if (deal.currentStageId !== input.fromStageId) {
    return { success: false, error: 'invalid_input', reason: 'stage_drift' };
  }
  if (!deal.closedAt && deal.forecastCategory !== 'closed') {
    return { success: false, error: 'invalid_input', reason: 'deal_not_closed' };
  }
  const reopenReason = input.reopenReason.trim();
  if (!reopenReason) {
    return { success: false, error: 'invalid_input', reason: 'invalid_reopen_reason' };
  }

  const pipeline = await repository.findPipelineById({
    pipelineId: deal.pipelineId,
    tenantId: deal.tenantId,
  });
  if (!pipeline) return { success: false, error: 'not_found' };
  const toStage = findStage(pipeline, input.toStageId);
  if (!toStage || isTerminalStage(toStage)) {
    return { success: false, error: 'invalid_input', reason: 'pipeline_stage_mismatch' };
  }

  const now = services.clock.now();
  const updated: CrmDeal = {
    ...deal,
    closedAt: null,
    currentStageId: toStage.id,
    forecastCategory: 'pipeline',
    lossReasonId: null,
    updatedAt: now,
  };
  const history = createStageHistory({
    actor: input.actor,
    dealId: deal.id,
    fromStageId: input.fromStageId,
    ids: services.ids,
    now,
    reason: reopenReason,
    tenantId: deal.tenantId,
    toStageId: toStage.id,
  });
  const { deal: saved, history: appended } = await repository.updateDealWithStageHistory({
    deal: updated,
    history,
  });
  return {
    deal: saved,
    event: {
      actor: eventActor(input.actor),
      aggregateId: saved.id,
      aggregateType: 'deal',
      idempotencyKey: input.idempotencyKey?.trim() || null,
      occurredAt: now,
      payload: {
        dealId: saved.id,
        fromStageId: input.fromStageId,
        pipelineId: saved.pipelineId,
        reopenReason,
        toStageId: toStage.id,
      },
      tenantId: saved.tenantId,
      type: 'crm.deal.reopened',
    },
    history: appended,
    success: true,
  };
}

export async function archiveCrmDeal(
  input: ArchiveCrmDealInput,
  repository: Pick<CrmDealRepository, 'findDealById' | 'updateDeal'>,
  services: { clock: CrmDealClock }
): Promise<ArchiveCrmDealResult> {
  const deal = await repository.findDealById({
    dealId: input.dealId,
    tenantId: input.actor.tenantId,
  });
  if (!deal) return { success: false, error: 'not_found' };
  const denied = authorizeExistingDeal(input.actor, deal);
  if (denied) return { success: false, error: 'forbidden', reason: denied };

  const now = services.clock.now();
  const updated: CrmDeal = {
    ...deal,
    archivedAt: deal.archivedAt ?? now,
    archivedById: deal.archivedById ?? input.actor.actorId,
    updatedAt: now,
  };
  return { deal: await repository.updateDeal({ deal: updated }), success: true };
}

function createTransitionEvent(
  actor: CrmActorContext,
  deal: CrmDeal,
  fromStageId: string,
  toStage: CrmPipelineStage,
  occurredAt: string,
  options: { idempotencyKey?: string | null; lossReasonId: string | null }
): CrmDealLostEvent | CrmDealStageChangedEvent | CrmDealWonEvent {
  const idempotencyKey = options.idempotencyKey?.trim() || null;
  if (toStage.isWon) {
    return {
      actor: eventActor(actor),
      aggregateId: deal.id,
      aggregateType: 'deal',
      idempotencyKey,
      occurredAt,
      payload: {
        accountId: deal.accountId,
        agentId: deal.agentId,
        branchId: deal.branchId,
        dealId: deal.id,
        valueCents: deal.valueAmountMinor,
      },
      tenantId: deal.tenantId,
      type: 'crm.deal.won',
    };
  }
  if (toStage.isLost) {
    return {
      actor: eventActor(actor),
      aggregateId: deal.id,
      aggregateType: 'deal',
      idempotencyKey,
      occurredAt,
      payload: {
        dealId: deal.id,
        fromStageId,
        lossReasonId: options.lossReasonId!,
        pipelineId: deal.pipelineId,
        toStageId: toStage.id,
      },
      tenantId: deal.tenantId,
      type: 'crm.deal.lost',
    };
  }
  return {
    actor: eventActor(actor),
    aggregateId: deal.id,
    aggregateType: 'deal',
    idempotencyKey,
    occurredAt,
    payload: {
      dealId: deal.id,
      fromStageId,
      isLost: false,
      isWon: false,
      pipelineId: deal.pipelineId,
      toStageId: toStage.id,
    },
    tenantId: deal.tenantId,
    type: 'crm.deal.stage_changed',
  };
}
