import { ensureTenantId, type SessionWithTenant } from '@interdomestik/shared-auth';
import {
  CRM_ACTOR_ROLES,
  type CrmActorContext,
  type CrmActorRole,
} from '@interdomestik/domain-crm/context';
import {
  CrmTaskRepositoryFailure,
  assignCrmTask,
  cancelCrmTask,
  completeCrmTask,
  createCrmTask,
  reopenCrmTask,
  startCrmTask,
  updateCrmTaskDueAt,
  type CrmTask,
  type CrmTaskAssignmentReasonCode,
  type CrmTaskAssignmentTarget,
  type CrmTaskCancellationReasonCode,
  type CrmTaskCompletionReasonCode,
  type CrmTaskCreateReasonCode,
  type CrmTaskDueReasonCode,
  type CrmTaskMutationDenialReason,
  type CrmTaskMutationResult,
  type CrmTaskPriority,
  type CrmTaskReopenReasonCode,
  type CrmTaskRepository,
  type CrmTaskStartReasonCode,
  type CrmTaskSubjectReference,
  type CrmTaskTransition,
} from '@interdomestik/domain-crm/tasks';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';

import { crmTaskRepository } from '@/adapters/crm/task-repository';
import { LOCALES } from '@/i18n/locales';
import { logAuditEvent, type AuditEvent } from '@/lib/audit';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { RateLimitResult } from '@/lib/rate-limit.core';

export type CrmTaskBoundaryOutcome =
  | 'success'
  | 'idempotent_replay'
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'invalid_input'
  | 'rate_limited'
  | 'unauthorized'
  | 'repository_failure';

export type CrmTaskBoundaryResult =
  | {
      readonly outcome: 'success';
      readonly task: CrmTask;
      readonly transition?: CrmTaskTransition | null;
    }
  | {
      readonly outcome: 'idempotent_replay';
      readonly reason: 'idempotent_replay';
      readonly task: CrmTask;
    }
  | {
      readonly outcome: Exclude<
        CrmTaskBoundaryOutcome,
        'success' | 'idempotent_replay' | 'rate_limited'
      >;
      readonly reason: string;
    }
  | {
      readonly outcome: 'rate_limited';
      readonly reason: 'rate_limited';
      readonly retryAfter?: number;
    };

export type CreateCrmTaskCoreInput = {
  readonly assignedTo: CrmTaskAssignmentTarget;
  readonly createReasonCode?: CrmTaskCreateReasonCode;
  readonly dueAt?: string | null;
  readonly idempotencyKey: string;
  readonly priority: CrmTaskPriority;
  readonly subjectReference: CrmTaskSubjectReference;
  readonly taskId?: string | null;
};

export type AssignCrmTaskCoreInput = {
  readonly assignedTo: CrmTaskAssignmentTarget;
  readonly expectedLifecycleVersion: number;
  readonly reasonCode: CrmTaskAssignmentReasonCode;
  readonly taskId: string;
};

export type UpdateCrmTaskDueAtCoreInput = {
  readonly dueAt: string | null;
  readonly expectedLifecycleVersion: number;
  readonly reasonCode: CrmTaskDueReasonCode;
  readonly taskId: string;
};

export type StartCrmTaskCoreInput = {
  readonly expectedLifecycleVersion: number;
  readonly reasonCode?: CrmTaskStartReasonCode;
  readonly taskId: string;
};

export type CompleteCrmTaskCoreInput = {
  readonly expectedLifecycleVersion: number;
  readonly reasonCode: CrmTaskCompletionReasonCode;
  readonly taskId: string;
};

export type CancelCrmTaskCoreInput = {
  readonly expectedLifecycleVersion: number;
  readonly reasonCode: CrmTaskCancellationReasonCode;
  readonly taskId: string;
};

export type ReopenCrmTaskCoreInput = {
  readonly expectedLifecycleVersion: number;
  readonly reasonCode: CrmTaskReopenReasonCode;
  readonly taskId: string;
};

type CrmTaskCoreDeps = {
  readonly audit?: (event: AuditEvent) => Promise<void>;
  readonly now?: () => string;
  readonly rateLimit?: typeof enforceRateLimitForAction;
  readonly repository?: CrmTaskRepository;
  readonly revalidate?: typeof revalidatePath;
  readonly taskId?: () => string;
};

type CoreParams = {
  readonly deps?: CrmTaskCoreDeps;
  readonly requestHeaders?: Headers;
  readonly session: SessionWithTenant;
};

type MutationContext =
  | {
      readonly actor: CrmActorContext;
      readonly deps: Required<CrmTaskCoreDeps>;
      readonly requestHeaders: Headers;
    }
  | CrmTaskBoundaryResult;

const MUTATION_LIMIT = 30;
const MUTATION_WINDOW_SECONDS = 60;
const CRM_TASK_REVALIDATION_PATHS = ['/agent/crm', '/staff/crm', '/admin/crm'] as const;

const defaultDeps: Required<CrmTaskCoreDeps> = {
  audit: logAuditEvent,
  now: () => new Date().toISOString(),
  rateLimit: enforceRateLimitForAction,
  repository: crmTaskRepository,
  revalidate: revalidatePath,
  taskId: nanoid,
};

function mergeDeps(deps?: CrmTaskCoreDeps): Required<CrmTaskCoreDeps> {
  return { ...defaultDeps, ...deps };
}

function failure(
  outcome: Exclude<CrmTaskBoundaryOutcome, 'success' | 'idempotent_replay' | 'rate_limited'>,
  reason: string
): CrmTaskBoundaryResult {
  return { outcome, reason };
}

function isCrmActorRole(role: unknown): role is CrmActorRole {
  return typeof role === 'string' && (CRM_ACTOR_ROLES as readonly string[]).includes(role);
}

function normalizeCrmActorRole(role: unknown): CrmActorRole | null {
  if (role === 'tenant_admin' || role === 'super_admin') return 'admin';
  return isCrmActorRole(role) ? role : null;
}

function createActorContext(session: SessionWithTenant): CrmActorContext | CrmTaskBoundaryResult {
  if (!session?.user?.id) return failure('unauthorized', 'missing_session');

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return failure('unauthorized', 'missing_session');
  }

  const role = normalizeCrmActorRole(session.user.role);
  if (!role) return failure('forbidden', 'role_scope');
  if (role === 'member') return failure('forbidden', 'role_scope');

  return {
    actorId: session.user.id,
    role,
    scope: {
      agentId: session.user.agentId ?? (role === 'agent' ? session.user.id : null),
      branchId: session.user.branchId ?? null,
      memberId: null,
      staffId:
        role === 'staff' || role === 'branch_manager' || role === 'admin' ? session.user.id : null,
    },
    tenantId,
  };
}

function isBoundaryResult(value: MutationContext): value is CrmTaskBoundaryResult {
  return 'outcome' in value;
}

function mapDomainDenial(reason: CrmTaskMutationDenialReason): CrmTaskBoundaryResult {
  if (reason === 'subject_not_found') return failure('not_found', reason);
  if (
    reason === 'terminal_state' ||
    reason === 'unsupported_transition' ||
    reason === 'duplicate_idempotency_conflict'
  ) {
    return failure('conflict', reason);
  }
  if (reason === 'non_monotonic_timestamp' || reason.startsWith('invalid_')) {
    return failure('invalid_input', reason);
  }
  return failure('forbidden', reason);
}

function mapRepositoryFailure(error: unknown): CrmTaskBoundaryResult {
  if (!(error instanceof CrmTaskRepositoryFailure)) {
    return failure('repository_failure', 'repository_failure');
  }
  if (error.reason === 'idempotency_conflict' || error.reason === 'lifecycle_conflict') {
    return failure('conflict', error.reason);
  }
  if (error.reason === 'subject_not_found') return failure('not_found', error.reason);
  return failure('forbidden', error.reason);
}

function mapRateLimit(limit: RateLimitResult): CrmTaskBoundaryResult | null {
  if (!limit.limited) return null;
  return {
    outcome: 'rate_limited',
    reason: 'rate_limited',
    retryAfter: limit.retryAfter,
  };
}

async function createMutationContext(params: CoreParams): Promise<MutationContext> {
  const actor = createActorContext(params.session);
  if ('outcome' in actor) return actor;

  const deps = mergeDeps(params.deps);
  const requestHeaders = params.requestHeaders ?? new Headers();
  const limit = await deps.rateLimit({
    headers: requestHeaders,
    keySuffix: actor.actorId,
    limit: MUTATION_LIMIT,
    name: 'action:crm-tasks',
    productionSensitive: true,
    windowSeconds: MUTATION_WINDOW_SECONDS,
  });
  const rateLimited = mapRateLimit(limit);
  if (rateLimited) return rateLimited;

  return { actor, deps, requestHeaders };
}

function revalidateCrmTaskPaths(deps: Required<CrmTaskCoreDeps>): void {
  for (const locale of LOCALES) {
    for (const path of CRM_TASK_REVALIDATION_PATHS) {
      deps.revalidate(`/${locale}${path}`);
    }
  }
}

function findTaskHistoryTransition(
  task: CrmTask,
  event: CrmTaskTransition['event']
): CrmTaskTransition | null {
  for (const entry of [...task.history].reverse()) {
    if (entry.event !== event) continue;
    return {
      event: entry.event,
      fromStatus: entry.fromStatus,
      reasonCode: entry.reasonCode,
      timestamp: entry.timestamp,
      toStatus: entry.toStatus,
    };
  }
  return null;
}

async function auditTaskMutation(params: {
  actor: CrmActorContext;
  deps: Required<CrmTaskCoreDeps>;
  replay: boolean;
  requestHeaders: Headers;
  task: CrmTask;
  transition: CrmTaskTransition | null;
  fallbackEvent: CrmTaskTransition['event'];
}): Promise<void> {
  const event = params.transition?.event ?? params.fallbackEvent;
  const transition = params.transition ?? findTaskHistoryTransition(params.task, event);
  await params.deps.audit({
    action: `crm.task.${event}`,
    actorId: params.actor.actorId,
    actorRole: params.actor.role,
    entityId: params.task.taskId,
    entityType: 'crm_task',
    headers: params.requestHeaders,
    metadata: {
      event,
      fromStatus: transition?.fromStatus ?? null,
      operation: event,
      reasonCode: transition?.reasonCode ?? null,
      replay: params.replay,
      subjectKind: params.task.subjectReference.kind,
      toStatus: transition?.toStatus ?? params.task.status,
    },
    tenantId: params.actor.tenantId,
  });
}

async function persistMutation(params: {
  actor: CrmActorContext;
  deps: Required<CrmTaskCoreDeps>;
  expectedLifecycleVersion: number;
  fallbackEvent: CrmTaskTransition['event'];
  requestHeaders: Headers;
  result: CrmTaskMutationResult;
}): Promise<CrmTaskBoundaryResult> {
  if (!params.result.success) return mapDomainDenial(params.result.reason);

  if (params.result.idempotent) {
    await auditTaskMutation({
      actor: params.actor,
      deps: params.deps,
      fallbackEvent: params.fallbackEvent,
      replay: true,
      requestHeaders: params.requestHeaders,
      task: params.result.task,
      transition: null,
    });
    return { outcome: 'idempotent_replay', reason: 'idempotent_replay', task: params.result.task };
  }

  try {
    const task = await params.deps.repository.saveTask({
      actor: params.actor,
      expectedLifecycleVersion: params.expectedLifecycleVersion,
      task: params.result.task,
    });
    await auditTaskMutation({
      actor: params.actor,
      deps: params.deps,
      fallbackEvent: params.fallbackEvent,
      replay: false,
      requestHeaders: params.requestHeaders,
      task,
      transition: params.result.transition,
    });
    revalidateCrmTaskPaths(params.deps);
    return { outcome: 'success', task, transition: params.result.transition };
  } catch (error) {
    return mapRepositoryFailure(error);
  }
}

async function runExistingTaskMutation(
  params: CoreParams & {
    readonly fallbackEvent: CrmTaskTransition['event'];
    readonly input: { readonly expectedLifecycleVersion: number; readonly taskId: string };
    readonly mutate: (
      task: CrmTask,
      actor: CrmActorContext,
      deps: Required<CrmTaskCoreDeps>
    ) => CrmTaskMutationResult;
  }
): Promise<CrmTaskBoundaryResult> {
  const context = await createMutationContext(params);
  if (isBoundaryResult(context)) return context;

  try {
    const task = await context.deps.repository.findTaskById({
      actor: context.actor,
      taskId: params.input.taskId,
    });
    if (!task) return failure('not_found', 'task_not_found');

    const result = params.mutate(task, context.actor, context.deps);
    return persistMutation({
      actor: context.actor,
      deps: context.deps,
      expectedLifecycleVersion: params.input.expectedLifecycleVersion,
      fallbackEvent: params.fallbackEvent,
      requestHeaders: context.requestHeaders,
      result,
    });
  } catch (error) {
    return mapRepositoryFailure(error);
  }
}

export async function readCrmTaskCore(
  params: CoreParams & { readonly taskId: string }
): Promise<CrmTaskBoundaryResult> {
  const actor = createActorContext(params.session);
  if ('outcome' in actor) return actor;

  const deps = mergeDeps(params.deps);
  try {
    const task = await deps.repository.findTaskById({ actor, taskId: params.taskId });
    if (!task) return failure('not_found', 'task_not_found');
    return { outcome: 'success', task };
  } catch (error) {
    return mapRepositoryFailure(error);
  }
}

export async function createCrmTaskCore(
  params: CoreParams & { readonly input: CreateCrmTaskCoreInput }
): Promise<CrmTaskBoundaryResult> {
  const context = await createMutationContext(params);
  if (isBoundaryResult(context)) return context;

  const { actor, deps, requestHeaders } = context;
  const { input } = params;

  if (!deps.repository.validateSubjectReference) {
    return failure('forbidden', 'subject_proof_missing');
  }

  try {
    const subjectProof = await deps.repository.validateSubjectReference({
      actor,
      subjectReference: input.subjectReference,
    });
    if (!subjectProof.visible) return mapDomainDenial(subjectProof.reason);

    const existingTask = await deps.repository.findTaskByIdempotencyKey({
      actor,
      idempotencyKey: input.idempotencyKey,
    });
    const result = createCrmTask(
      {
        actor,
        assignedTo: input.assignedTo,
        createReasonCode: input.createReasonCode,
        dueAt: input.dueAt,
        existingTask,
        idempotencyKey: input.idempotencyKey,
        priority: input.priority,
        subjectProof: {
          branchId: subjectProof.branchId ?? null,
          subjectReference: input.subjectReference,
          tenantId: subjectProof.tenantId,
        },
        subjectReference: input.subjectReference,
        taskId: input.taskId,
        tenantId: actor.tenantId,
      },
      { now: deps.now, taskId: deps.taskId }
    );

    if (!result.success) return mapDomainDenial(result.reason);

    if (result.idempotent) {
      await auditTaskMutation({
        actor,
        deps,
        fallbackEvent: 'created',
        replay: true,
        requestHeaders,
        task: result.task,
        transition: null,
      });
      return { outcome: 'idempotent_replay', reason: 'idempotent_replay', task: result.task };
    }

    const task = await deps.repository.saveTask({ actor, task: result.task });
    const replay = task.taskId !== result.task.taskId;
    await auditTaskMutation({
      actor,
      deps,
      fallbackEvent: 'created',
      replay,
      requestHeaders,
      task,
      transition: replay ? null : result.transition,
    });
    if (replay) return { outcome: 'idempotent_replay', reason: 'idempotent_replay', task };

    revalidateCrmTaskPaths(deps);
    return { outcome: 'success', task, transition: result.transition };
  } catch (error) {
    return mapRepositoryFailure(error);
  }
}

export async function assignCrmTaskCore(
  params: CoreParams & { readonly input: AssignCrmTaskCoreInput }
): Promise<CrmTaskBoundaryResult> {
  return runExistingTaskMutation({
    ...params,
    fallbackEvent: 'assigned',
    mutate: (task, actor, deps) =>
      assignCrmTask(
        task,
        { actor, assignedTo: params.input.assignedTo, reasonCode: params.input.reasonCode },
        { now: deps.now }
      ),
  });
}

export async function updateCrmTaskDueAtCore(
  params: CoreParams & { readonly input: UpdateCrmTaskDueAtCoreInput }
): Promise<CrmTaskBoundaryResult> {
  return runExistingTaskMutation({
    ...params,
    fallbackEvent: 'due_updated',
    mutate: (task, actor, deps) =>
      updateCrmTaskDueAt(
        task,
        { actor, dueAt: params.input.dueAt, reasonCode: params.input.reasonCode },
        { now: deps.now }
      ),
  });
}

export async function startCrmTaskCore(
  params: CoreParams & { readonly input: StartCrmTaskCoreInput }
): Promise<CrmTaskBoundaryResult> {
  return runExistingTaskMutation({
    ...params,
    fallbackEvent: 'started',
    mutate: (task, actor, deps) =>
      startCrmTask(task, { actor, reasonCode: params.input.reasonCode }, { now: deps.now }),
  });
}

export async function completeCrmTaskCore(
  params: CoreParams & { readonly input: CompleteCrmTaskCoreInput }
): Promise<CrmTaskBoundaryResult> {
  return runExistingTaskMutation({
    ...params,
    fallbackEvent: 'completed',
    mutate: (task, actor, deps) =>
      completeCrmTask(task, { actor, reasonCode: params.input.reasonCode }, { now: deps.now }),
  });
}

export async function cancelCrmTaskCore(
  params: CoreParams & { readonly input: CancelCrmTaskCoreInput }
): Promise<CrmTaskBoundaryResult> {
  return runExistingTaskMutation({
    ...params,
    fallbackEvent: 'cancelled',
    mutate: (task, actor, deps) =>
      cancelCrmTask(task, { actor, reasonCode: params.input.reasonCode }, { now: deps.now }),
  });
}

export async function reopenCrmTaskCore(
  params: CoreParams & { readonly input: ReopenCrmTaskCoreInput }
): Promise<CrmTaskBoundaryResult> {
  return runExistingTaskMutation({
    ...params,
    fallbackEvent: 'reopened',
    mutate: (task, actor, deps) =>
      reopenCrmTask(task, { actor, reasonCode: params.input.reasonCode }, { now: deps.now }),
  });
}
