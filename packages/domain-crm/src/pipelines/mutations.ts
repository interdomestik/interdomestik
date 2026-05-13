import type { CrmActorContext } from '../context';
import type { CrmPipelineRepository } from './repository';
import type { CrmPipeline, CrmPipelineStage, CrmPipelineStageInput } from './types';

export type CrmPipelineClock = {
  now(): string;
};

export type CrmPipelineIds = {
  pipelineId(): string;
  pipelineStageId(): string;
};

export type CreateCrmPipelineInput = {
  actor: CrmActorContext;
  branchId?: string | null;
  name: string;
  stages: readonly CrmPipelineStageInput[];
  tenantId: string;
};

export type AddCrmPipelineStageInput = {
  actor: CrmActorContext;
  pipelineId: string;
  stage: CrmPipelineStageInput;
  tenantId: string;
};

export type UpdateCrmPipelineStageInput = {
  actor: CrmActorContext;
  expectedDurationDays?: number | null;
  isLost?: boolean;
  isWon?: boolean;
  name?: string;
  order?: number;
  pipelineId: string;
  probability?: number;
  stageId: string;
  tenantId: string;
};

export type ReorderCrmPipelineStagesInput = {
  actor: CrmActorContext;
  pipelineId: string;
  stageOrders: readonly { order: number; stageId: string }[];
  tenantId: string;
};

export type ArchiveCrmPipelineInput = {
  actor: CrmActorContext;
  pipelineId: string;
  tenantId: string;
};

export type CrmPipelineMutationDenialReason =
  | 'tenant_scope'
  | 'agent_scope'
  | 'branch_scope'
  | 'role_scope';

export type CrmPipelineValidationReason =
  | 'invalid_name'
  | 'invalid_stage_name'
  | 'invalid_stage_order'
  | 'invalid_stage_probability'
  | 'invalid_expected_duration'
  | 'invalid_terminal_flags'
  | 'missing_terminal_stage'
  | 'archived_pipeline'
  | 'stage_not_found';

export type CrmPipelineMutationResult =
  | { success: true; pipeline: CrmPipeline }
  | { success: false; error: 'forbidden'; reason: CrmPipelineMutationDenialReason }
  | { success: false; error: 'invalid_input'; reason: CrmPipelineValidationReason }
  | { success: false; error: 'not_found' };

function authorizePipelineAuthor(
  actor: CrmActorContext,
  tenantId: string,
  branchId: string | null
): CrmPipelineMutationDenialReason | null {
  if (actor.tenantId !== tenantId) return 'tenant_scope';
  if (actor.role === 'admin') return null;
  if (actor.role !== 'branch_manager') return 'role_scope';
  if (!actor.scope.branchId || branchId !== actor.scope.branchId) return 'branch_scope';
  return null;
}

function authorizeExistingPipeline(
  actor: CrmActorContext,
  pipeline: Pick<CrmPipeline, 'branchId' | 'tenantId'>
): CrmPipelineMutationDenialReason | null {
  if (actor.tenantId !== pipeline.tenantId) return 'tenant_scope';
  if (actor.role === 'admin') return null;
  if (actor.role !== 'branch_manager') return 'role_scope';
  if (!actor.scope.branchId || pipeline.branchId !== actor.scope.branchId) return 'branch_scope';
  return null;
}

function validateStage(stage: CrmPipelineStageInput): CrmPipelineValidationReason | null {
  if (!stage.name.trim()) return 'invalid_stage_name';
  if (!Number.isInteger(stage.order) || stage.order < 0) return 'invalid_stage_order';
  if (!Number.isInteger(stage.probability) || stage.probability < 0 || stage.probability > 100) {
    return 'invalid_stage_probability';
  }
  if (stage.isWon && stage.isLost) return 'invalid_terminal_flags';
  if (stage.isWon && stage.probability !== 100) return 'invalid_stage_probability';
  if (stage.isLost && stage.probability !== 0) return 'invalid_stage_probability';
  if (!stage.isWon && !stage.isLost && stage.probability >= 100) {
    return 'invalid_stage_probability';
  }
  if (
    stage.expectedDurationDays != null &&
    (!Number.isInteger(stage.expectedDurationDays) || stage.expectedDurationDays < 0)
  ) {
    return 'invalid_expected_duration';
  }
  return null;
}

export function validateCrmPipelineStages(
  stages: readonly CrmPipelineStageInput[]
): CrmPipelineValidationReason | null {
  const orders = new Set<number>();
  let wonCount = 0;
  let lostCount = 0;

  for (const stage of stages) {
    const invalid = validateStage(stage);
    if (invalid) return invalid;
    if (orders.has(stage.order)) return 'invalid_stage_order';
    orders.add(stage.order);
    if (stage.isWon) wonCount += 1;
    if (stage.isLost) lostCount += 1;
  }

  if (wonCount !== 1 || lostCount < 1) return 'missing_terminal_stage';
  return null;
}

function toStageInput(stage: CrmPipelineStage): CrmPipelineStageInput {
  return {
    expectedDurationDays: stage.expectedDurationDays ?? null,
    isLost: stage.isLost,
    isWon: stage.isWon,
    name: stage.name,
    order: stage.order,
    probability: stage.probability,
  };
}

async function loadMutablePipeline(
  input: { actor: CrmActorContext; pipelineId: string; tenantId: string },
  repository: Pick<CrmPipelineRepository, 'findPipelineById'>
): Promise<
  | { success: true; pipeline: CrmPipeline }
  | { success: false; error: 'forbidden'; reason: CrmPipelineMutationDenialReason }
  | { success: false; error: 'invalid_input'; reason: 'archived_pipeline' }
  | { success: false; error: 'not_found' }
> {
  const pipeline = await repository.findPipelineById({
    pipelineId: input.pipelineId,
    tenantId: input.tenantId,
  });
  if (!pipeline) return { success: false, error: 'not_found' };
  const denied = authorizeExistingPipeline(input.actor, pipeline);
  if (denied) return { success: false, error: 'forbidden', reason: denied };
  if (pipeline.archivedAt) {
    return { success: false, error: 'invalid_input', reason: 'archived_pipeline' };
  }
  return { success: true, pipeline };
}

function validateUpdatedStages(
  stages: readonly CrmPipelineStage[]
): CrmPipelineValidationReason | null {
  return validateCrmPipelineStages(stages.map(toStageInput));
}

export async function createCrmPipeline(
  input: CreateCrmPipelineInput,
  repository: Pick<CrmPipelineRepository, 'createPipeline'>,
  services: { clock: CrmPipelineClock; ids: CrmPipelineIds }
): Promise<CrmPipelineMutationResult> {
  const name = input.name.trim();
  if (!name) return { success: false, error: 'invalid_input', reason: 'invalid_name' };

  const branchId = input.branchId?.trim() || null;
  const denied = authorizePipelineAuthor(input.actor, input.tenantId, branchId);
  if (denied) return { success: false, error: 'forbidden', reason: denied };

  const invalidStages = validateCrmPipelineStages(input.stages);
  if (invalidStages) return { success: false, error: 'invalid_input', reason: invalidStages };

  const now = services.clock.now();
  const pipelineId = services.ids.pipelineId();
  const stages: CrmPipelineStage[] = input.stages.map(stage => ({
    expectedDurationDays: stage.expectedDurationDays ?? null,
    id: services.ids.pipelineStageId(),
    isLost: stage.isLost === true,
    isWon: stage.isWon === true,
    name: stage.name.trim(),
    order: stage.order,
    pipelineId,
    probability: stage.probability,
    tenantId: input.tenantId,
  }));

  const pipeline: CrmPipeline = {
    archivedAt: null,
    archivedById: null,
    branchId,
    createdAt: now,
    id: pipelineId,
    name,
    stages,
    tenantId: input.tenantId,
    updatedAt: now,
  };

  return { pipeline: await repository.createPipeline({ pipeline }), success: true };
}

export async function addCrmPipelineStage(
  input: AddCrmPipelineStageInput,
  repository: Pick<CrmPipelineRepository, 'findPipelineById' | 'updatePipeline'>,
  services: { clock: CrmPipelineClock; ids: Pick<CrmPipelineIds, 'pipelineStageId'> }
): Promise<CrmPipelineMutationResult> {
  const loaded = await loadMutablePipeline(input, repository);
  if (!loaded.success) return loaded;

  const stage: CrmPipelineStage = {
    expectedDurationDays: input.stage.expectedDurationDays ?? null,
    id: services.ids.pipelineStageId(),
    isLost: input.stage.isLost === true,
    isWon: input.stage.isWon === true,
    name: input.stage.name.trim(),
    order: input.stage.order,
    pipelineId: loaded.pipeline.id,
    probability: input.stage.probability,
    tenantId: loaded.pipeline.tenantId,
  };
  const stages = [...loaded.pipeline.stages, stage];
  const invalid = validateUpdatedStages(stages);
  if (invalid) return { success: false, error: 'invalid_input', reason: invalid };

  const updated = {
    ...loaded.pipeline,
    stages,
    updatedAt: services.clock.now(),
  };
  return { pipeline: await repository.updatePipeline({ pipeline: updated }), success: true };
}

export async function updateCrmPipelineStage(
  input: UpdateCrmPipelineStageInput,
  repository: Pick<CrmPipelineRepository, 'findPipelineById' | 'updatePipeline'>,
  services: { clock: CrmPipelineClock }
): Promise<CrmPipelineMutationResult> {
  const loaded = await loadMutablePipeline(input, repository);
  if (!loaded.success) return loaded;

  let found = false;
  const stages = loaded.pipeline.stages.map(stage => {
    if (stage.id !== input.stageId) return stage;
    found = true;
    return {
      ...stage,
      expectedDurationDays:
        input.expectedDurationDays !== undefined
          ? input.expectedDurationDays
          : (stage.expectedDurationDays ?? null),
      isLost: input.isLost ?? stage.isLost,
      isWon: input.isWon ?? stage.isWon,
      name: input.name !== undefined ? input.name.trim() : stage.name,
      order: input.order ?? stage.order,
      probability: input.probability ?? stage.probability,
    };
  });
  if (!found) return { success: false, error: 'invalid_input', reason: 'stage_not_found' };
  const invalid = validateUpdatedStages(stages);
  if (invalid) return { success: false, error: 'invalid_input', reason: invalid };

  const updated = {
    ...loaded.pipeline,
    stages,
    updatedAt: services.clock.now(),
  };
  return { pipeline: await repository.updatePipeline({ pipeline: updated }), success: true };
}

export async function reorderCrmPipelineStages(
  input: ReorderCrmPipelineStagesInput,
  repository: Pick<CrmPipelineRepository, 'findPipelineById' | 'updatePipeline'>,
  services: { clock: CrmPipelineClock }
): Promise<CrmPipelineMutationResult> {
  const loaded = await loadMutablePipeline(input, repository);
  if (!loaded.success) return loaded;

  if (input.stageOrders.length !== loaded.pipeline.stages.length) {
    return { success: false, error: 'invalid_input', reason: 'invalid_stage_order' };
  }
  const requestedStageIds = new Set(input.stageOrders.map(stage => stage.stageId));
  if (requestedStageIds.size !== input.stageOrders.length) {
    return { success: false, error: 'invalid_input', reason: 'invalid_stage_order' };
  }
  const orderByStage = new Map(input.stageOrders.map(stage => [stage.stageId, stage.order]));
  if (requestedStageIds.size !== loaded.pipeline.stages.length) {
    return { success: false, error: 'invalid_input', reason: 'invalid_stage_order' };
  }
  const stages = loaded.pipeline.stages.map(stage => {
    const order = orderByStage.get(stage.id);
    if (order === undefined) return null;
    return { ...stage, order };
  });
  if (stages.some(stage => stage === null)) {
    return { success: false, error: 'invalid_input', reason: 'invalid_stage_order' };
  }

  const updatedStages = stages as CrmPipelineStage[];
  const invalid = validateUpdatedStages(updatedStages);
  if (invalid) return { success: false, error: 'invalid_input', reason: invalid };

  const updated = {
    ...loaded.pipeline,
    stages: updatedStages,
    updatedAt: services.clock.now(),
  };
  return { pipeline: await repository.updatePipeline({ pipeline: updated }), success: true };
}

export async function archiveCrmPipeline(
  input: ArchiveCrmPipelineInput,
  repository: Pick<CrmPipelineRepository, 'findPipelineById' | 'updatePipeline'>,
  services: { clock: CrmPipelineClock }
): Promise<CrmPipelineMutationResult> {
  const pipeline = await repository.findPipelineById({
    pipelineId: input.pipelineId,
    tenantId: input.tenantId,
  });
  if (!pipeline) return { success: false, error: 'not_found' };
  const denied = authorizeExistingPipeline(input.actor, pipeline);
  if (denied) return { success: false, error: 'forbidden', reason: denied };

  const now = services.clock.now();
  const updated = {
    ...pipeline,
    archivedAt: pipeline.archivedAt ?? now,
    archivedById: pipeline.archivedById ?? input.actor.actorId,
    updatedAt: now,
  };
  return { pipeline: await repository.updatePipeline({ pipeline: updated }), success: true };
}
