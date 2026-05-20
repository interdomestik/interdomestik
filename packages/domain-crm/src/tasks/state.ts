import { CRM_ACTOR_ROLES, type CrmActorContext } from '../context';
import {
  CRM_TASK_ASSIGNABLE_ROLES,
  CRM_TASK_ASSIGNMENT_REASON_CODES,
  CRM_TASK_CANCELLATION_REASON_CODES,
  CRM_TASK_COMPLETION_REASON_CODES,
  CRM_TASK_CREATE_REASON_CODES,
  CRM_TASK_DUE_REASON_CODES,
  CRM_TASK_MUTATION_BLOCKED_STATUSES,
  CRM_TASK_MUTATION_ROLES,
  CRM_TASK_PRIORITIES,
  CRM_TASK_REOPEN_REASON_CODES,
  CRM_TASK_START_REASON_CODES,
  CRM_TASK_STATUSES,
  CRM_TASK_SUBJECT_KINDS,
  CRM_TASK_TERMINAL_STATUSES,
  type AssignCrmTaskInput,
  type CancelCrmTaskInput,
  type CompleteCrmTaskInput,
  type CreateCrmTaskInput,
  type CrmTask,
  type CrmTaskActorSnapshot,
  type CrmTaskAssignmentReasonCode,
  type CrmTaskAssignmentTarget,
  type CrmTaskCancellationReasonCode,
  type CrmTaskClock,
  type CrmTaskCompletionReasonCode,
  type CrmTaskCreateReasonCode,
  type CrmTaskDueReasonCode,
  type CrmTaskHistoryEntry,
  type CrmTaskIds,
  type CrmTaskMutationDenialReason,
  type CrmTaskMutationResult,
  type CrmTaskPriority,
  type CrmTaskReopenReasonCode,
  type CrmTaskStartReasonCode,
  type CrmTaskStatus,
  type CrmTaskSubjectProof,
  type CrmTaskSubjectReference,
  type CrmTaskTransition,
  type ReopenCrmTaskInput,
  type StartCrmTaskInput,
  type UpdateCrmTaskDueInput,
} from './types';

const STRUCTURAL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export const CRM_TASK_ALLOWED_TRANSITIONS = {
  pending: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['in_progress'],
  cancelled: [],
} as const satisfies Record<CrmTaskStatus, readonly CrmTaskStatus[]>;

export function isCrmTaskTerminalStatus(status: CrmTaskStatus): boolean {
  return (CRM_TASK_TERMINAL_STATUSES as readonly CrmTaskStatus[]).includes(status);
}

export function isCrmTaskMutationBlockedStatus(status: CrmTaskStatus): boolean {
  return (CRM_TASK_MUTATION_BLOCKED_STATUSES as readonly CrmTaskStatus[]).includes(status);
}

export function canTransitionCrmTaskStatus(from: CrmTaskStatus, to: CrmTaskStatus): boolean {
  return (CRM_TASK_ALLOWED_TRANSITIONS[from] as readonly CrmTaskStatus[]).includes(to);
}

function invalid(reason: CrmTaskMutationDenialReason): CrmTaskMutationResult {
  return { error: 'invalid_input', reason, success: false };
}

function forbidden(reason: CrmTaskMutationDenialReason): CrmTaskMutationResult {
  return { error: 'forbidden', reason, success: false };
}

function terminal(reason: CrmTaskMutationDenialReason): CrmTaskMutationResult {
  return { error: 'terminal_state', reason, success: false };
}

function idempotentConflict(reason: CrmTaskMutationDenialReason): CrmTaskMutationResult {
  return { error: 'idempotent_conflict', reason, success: false };
}

function isStructuralId(value: unknown): value is string {
  return typeof value === 'string' && STRUCTURAL_ID_PATTERN.test(value);
}

function includesValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function timestampMs(value: string): number {
  return Date.parse(value);
}

function isAfterCurrentUpdate(task: CrmTask, timestamp: string): boolean {
  return timestampMs(timestamp) > timestampMs(task.updatedAt);
}

function actorBranchId(actor: CrmActorContext): string | null {
  return actor.scope.branchId ?? null;
}

function snapshotActor(actor: CrmActorContext): CrmTaskActorSnapshot {
  return {
    actorId: actor.actorId,
    branchId: actorBranchId(actor),
    role: actor.role,
    tenantId: actor.tenantId,
  };
}

function sanitizeSubjectReference(
  subjectReference: CrmTaskSubjectReference
): CrmTaskSubjectReference {
  return {
    id: subjectReference.id,
    kind: subjectReference.kind,
  };
}

function sanitizeAssignmentTarget(assignedTo: CrmTaskAssignmentTarget): CrmTaskAssignmentTarget {
  if (assignedTo.kind === 'unassigned') return { kind: 'unassigned' };
  if (assignedTo.kind === 'actor') {
    return {
      actorId: assignedTo.actorId,
      branchId: assignedTo.branchId ?? null,
      kind: 'actor',
      role: assignedTo.role,
      tenantId: assignedTo.tenantId ?? null,
    };
  }
  if (assignedTo.kind === 'role') {
    return {
      branchId: assignedTo.branchId ?? null,
      kind: 'role',
      role: assignedTo.role,
      tenantId: assignedTo.tenantId ?? null,
    };
  }
  return {
    branchId: assignedTo.branchId ?? null,
    kind: 'team',
    teamId: assignedTo.teamId,
    tenantId: assignedTo.tenantId ?? null,
  };
}

function validateActor(actor: CrmActorContext | null | undefined): CrmTaskMutationResult | null {
  if (!actor || !isStructuralId(actor.actorId) || !isStructuralId(actor.tenantId) || !actor.scope) {
    return invalid('actor_scope');
  }

  if (!includesValue(CRM_ACTOR_ROLES, actor.role)) {
    return forbidden('role_scope');
  }

  if (!includesValue(CRM_TASK_MUTATION_ROLES, actor.role)) {
    return forbidden('role_scope');
  }

  return null;
}

function validateTenant(actor: CrmActorContext, tenantId: string): CrmTaskMutationResult | null {
  if (!isStructuralId(tenantId) || actor.tenantId !== tenantId) {
    return forbidden('tenant_scope');
  }
  return null;
}

function validateSubjectReference(
  subjectReference: CrmTaskSubjectReference
): CrmTaskMutationResult | null {
  if (
    !subjectReference ||
    !includesValue(CRM_TASK_SUBJECT_KINDS, subjectReference.kind) ||
    !isStructuralId(subjectReference.id)
  ) {
    return invalid('invalid_subject_reference');
  }
  return null;
}

function validateSubjectProof(
  actor: CrmActorContext,
  tenantId: string,
  subjectReference: CrmTaskSubjectReference,
  subjectProof: CrmTaskSubjectProof | null | undefined
): CrmTaskMutationResult | null {
  if (!subjectProof) return invalid('subject_proof_missing');
  const subjectError = validateSubjectReference(subjectProof.subjectReference);
  if (subjectError) return subjectError;
  if (
    subjectProof.tenantId !== tenantId ||
    subjectProof.subjectReference.kind !== subjectReference.kind ||
    subjectProof.subjectReference.id !== subjectReference.id
  ) {
    return forbidden('tenant_scope');
  }
  if (!subjectProof.branchId && actor.role !== 'admin') return forbidden('branch_scope');
  return validateBranchScope(actor, subjectProof.branchId ?? null);
}

function validateBranchScope(
  actor: CrmActorContext,
  requestedBranchId: string | null | undefined
): CrmTaskMutationResult | null {
  if (!requestedBranchId) return null;
  if (!isStructuralId(requestedBranchId)) return forbidden('branch_scope');
  if (actor.role === 'admin') return null;
  if (!actorBranchId(actor) || actorBranchId(actor) !== requestedBranchId) {
    return forbidden('branch_scope');
  }
  return null;
}

function validateAssignmentTarget(
  actor: CrmActorContext,
  tenantId: string,
  assignedTo: CrmTaskAssignmentTarget
): CrmTaskMutationResult | null {
  if (!assignedTo) return invalid('invalid_assignment_target');

  if (assignedTo.kind === 'unassigned') return null;

  if ('tenantId' in assignedTo && assignedTo.tenantId && assignedTo.tenantId !== tenantId) {
    return forbidden('assignment_scope');
  }

  const branchError = validateBranchScope(actor, assignedTo.branchId ?? null);
  if (branchError) return branchError;

  if (assignedTo.kind === 'actor') {
    if (!isStructuralId(assignedTo.actorId)) return invalid('invalid_assignment_target');
    if (!includesValue(CRM_TASK_ASSIGNABLE_ROLES, assignedTo.role)) {
      return forbidden('assignment_scope');
    }
    return null;
  }

  if (assignedTo.kind === 'role') {
    if (!includesValue(CRM_TASK_ASSIGNABLE_ROLES, assignedTo.role)) {
      return forbidden('assignment_scope');
    }
    return null;
  }

  if (assignedTo.kind === 'team') {
    return isStructuralId(assignedTo.teamId) ? null : invalid('invalid_assignment_target');
  }

  return invalid('invalid_assignment_target');
}

function validateAssignmentTaskBranch(
  assignedTo: CrmTaskAssignmentTarget,
  taskBranchId: string | null
): CrmTaskMutationResult | null {
  if (assignedTo.kind === 'unassigned') return null;
  const targetBranchId = assignedTo.branchId ?? null;
  if (taskBranchId == null) {
    return targetBranchId == null ? null : forbidden('branch_scope');
  }
  return targetBranchId === taskBranchId ? null : forbidden('branch_scope');
}

function validatePriority(priority: CrmTaskPriority): CrmTaskMutationResult | null {
  return includesValue(CRM_TASK_PRIORITIES, priority) ? null : invalid('invalid_priority');
}

function validateReason<T extends readonly string[]>(
  reasonCode: string,
  allowed: T
): CrmTaskMutationResult | null {
  return includesValue(allowed, reasonCode) ? null : invalid('invalid_reason_code');
}

function immutableAssignmentMaterial(assignedTo: CrmTaskAssignmentTarget): string {
  if (assignedTo.kind === 'unassigned') return JSON.stringify({ kind: 'unassigned' });
  if (assignedTo.kind === 'actor') {
    return JSON.stringify({
      actorId: assignedTo.actorId,
      branchId: assignedTo.branchId ?? null,
      kind: 'actor',
      role: assignedTo.role,
      tenantId: assignedTo.tenantId ?? null,
    });
  }
  if (assignedTo.kind === 'role') {
    return JSON.stringify({
      branchId: assignedTo.branchId ?? null,
      kind: 'role',
      role: assignedTo.role,
      tenantId: assignedTo.tenantId ?? null,
    });
  }
  return JSON.stringify({
    branchId: assignedTo.branchId ?? null,
    kind: 'team',
    teamId: assignedTo.teamId,
    tenantId: assignedTo.tenantId ?? null,
  });
}

function createMaterial(args: {
  actor: CrmActorContext;
  assignedTo: CrmTaskAssignmentTarget;
  branchId: string | null;
  createReasonCode: CrmTaskCreateReasonCode;
  dueAt: string | null;
  priority: CrmTaskPriority;
  subjectReference: CrmTaskSubjectReference;
  taskId: string;
  tenantId: string;
}): string {
  return JSON.stringify({
    assignedTo: JSON.parse(immutableAssignmentMaterial(args.assignedTo)) as unknown,
    createdBy: {
      actorId: args.actor.actorId,
      branchId: actorBranchId(args.actor) ?? null,
      role: args.actor.role,
      tenantId: args.actor.tenantId,
    },
    dueAt: args.dueAt,
    priority: args.priority,
    branchId: args.branchId,
    createReasonCode: args.createReasonCode,
    subjectReference: args.subjectReference,
    taskId: args.taskId,
    tenantId: args.tenantId,
  });
}

function existingMaterial(task: CrmTask): string {
  return JSON.stringify({
    assignedTo: JSON.parse(immutableAssignmentMaterial(task.assignedTo)) as unknown,
    createdBy: {
      actorId: task.createdBy.actorId,
      branchId: task.createdBy.branchId ?? null,
      role: task.createdBy.role,
      tenantId: task.createdBy.tenantId,
    },
    dueAt: task.dueAt,
    priority: task.priority,
    branchId: task.branchId,
    createReasonCode: task.createReasonCode,
    subjectReference: task.subjectReference,
    taskId: task.taskId,
    tenantId: task.tenantId,
  });
}

function transition(
  event: CrmTaskTransition['event'],
  fromStatus: CrmTaskStatus | null,
  toStatus: CrmTaskStatus,
  reasonCode: CrmTaskTransition['reasonCode'],
  timestamp: string
): CrmTaskTransition {
  return { event, fromStatus, reasonCode, timestamp, toStatus };
}

function historyEntry(actor: CrmActorContext, transition: CrmTaskTransition): CrmTaskHistoryEntry {
  return { actor: snapshotActor(actor), ...transition };
}

function applyTransition(args: {
  actor: CrmActorContext;
  completedAt?: string | null;
  completionReasonCode?: CrmTaskCompletionReasonCode | null;
  dueAt?: string | null;
  assignedTo?: CrmTaskAssignmentTarget;
  cancellationReasonCode?: CrmTaskCancellationReasonCode | null;
  cancelledAt?: string | null;
  reopenReasonCode?: CrmTaskReopenReasonCode | null;
  reopenedAt?: string | null;
  task: CrmTask;
  transition: CrmTaskTransition;
}): CrmTaskMutationResult {
  const entry = historyEntry(args.actor, args.transition);
  const task: CrmTask = {
    ...args.task,
    assignedTo: args.assignedTo ?? args.task.assignedTo,
    cancelledAt: args.cancelledAt === undefined ? args.task.cancelledAt : args.cancelledAt,
    cancellationReasonCode:
      args.cancellationReasonCode === undefined
        ? args.task.cancellationReasonCode
        : args.cancellationReasonCode,
    completedAt: args.completedAt === undefined ? args.task.completedAt : args.completedAt,
    completionReasonCode:
      args.completionReasonCode === undefined
        ? args.task.completionReasonCode
        : args.completionReasonCode,
    dueAt: args.dueAt === undefined ? args.task.dueAt : args.dueAt,
    history: [...args.task.history, entry],
    reopenedAt: args.reopenedAt === undefined ? args.task.reopenedAt : args.reopenedAt,
    reopenReasonCode:
      args.reopenReasonCode === undefined ? args.task.reopenReasonCode : args.reopenReasonCode,
    status: args.transition.toStatus,
    updatedAt: args.transition.timestamp,
  };
  return { success: true, task, transition: args.transition };
}

function validateMutableTaskActor(
  actor: CrmActorContext,
  task: CrmTask
): CrmTaskMutationResult | null {
  return (
    validateActor(actor) ??
    validateTenant(actor, task.tenantId) ??
    validateTaskBranchScope(actor, task)
  );
}

function validateTaskBranchScope(
  actor: CrmActorContext,
  task: CrmTask
): CrmTaskMutationResult | null {
  if (actor.role === 'admin') return null;
  if (!task.branchId) return forbidden('branch_scope');
  return validateBranchScope(actor, task.branchId);
}

function validateMutationTimestamp(task: CrmTask, timestamp: string): CrmTaskMutationResult | null {
  return normalizeTimestamp(timestamp) == null
    ? invalid('invalid_timestamp')
    : isAfterCurrentUpdate(task, timestamp)
      ? null
      : invalid('non_monotonic_timestamp');
}

export function createCrmTask(
  input: CreateCrmTaskInput,
  services: CrmTaskClock & CrmTaskIds
): CrmTaskMutationResult {
  const actorError = validateActor(input.actor);
  if (actorError) return actorError;
  const tenantError = validateTenant(input.actor, input.tenantId);
  if (tenantError) return tenantError;
  const subjectError = validateSubjectReference(input.subjectReference);
  if (subjectError) return subjectError;
  const subjectProofError = validateSubjectProof(
    input.actor,
    input.tenantId,
    input.subjectReference,
    input.subjectProof
  );
  if (subjectProofError) return subjectProofError;
  const assignmentError = validateAssignmentTarget(input.actor, input.tenantId, input.assignedTo);
  if (assignmentError) return assignmentError;
  const assignmentBranchError = validateAssignmentTaskBranch(
    input.assignedTo,
    input.subjectProof.branchId ?? null
  );
  if (assignmentBranchError) return assignmentBranchError;
  const priorityError = validatePriority(input.priority);
  if (priorityError) return priorityError;
  const reasonCode: CrmTaskCreateReasonCode = input.createReasonCode ?? 'manual';
  const reasonError = validateReason(reasonCode, CRM_TASK_CREATE_REASON_CODES);
  if (reasonError) return reasonError;

  const taskId = input.taskId ?? services.taskId();
  if (!isStructuralId(taskId)) return invalid('invalid_task_id');
  if (input.idempotencyKey != null && !isStructuralId(input.idempotencyKey)) {
    return invalid('invalid_idempotency_key');
  }

  const now = normalizeTimestamp(services.now());
  if (!now) return invalid('invalid_timestamp');
  const dueAt = input.dueAt == null ? null : normalizeTimestamp(input.dueAt);
  if (input.dueAt != null && !dueAt) return invalid('invalid_due_at');

  const material = createMaterial({
    actor: input.actor,
    assignedTo: sanitizeAssignmentTarget(input.assignedTo),
    branchId: input.subjectProof.branchId ?? null,
    createReasonCode: reasonCode,
    dueAt,
    priority: input.priority,
    subjectReference: sanitizeSubjectReference(input.subjectReference),
    taskId,
    tenantId: input.tenantId,
  });

  if (input.existingTask) {
    if (!input.idempotencyKey) return invalid('invalid_idempotency_key');
    if (input.existingTask.idempotencyKey !== input.idempotencyKey) {
      return idempotentConflict('duplicate_idempotency_conflict');
    }
    if (existingMaterial(input.existingTask) !== material) {
      return idempotentConflict('duplicate_idempotency_conflict');
    }
    return { idempotent: true, success: true, task: input.existingTask, transition: null };
  }

  const createTransition = transition('created', null, 'pending', reasonCode, now);
  const task: CrmTask = {
    assignedTo: sanitizeAssignmentTarget(input.assignedTo),
    branchId: input.subjectProof.branchId ?? null,
    cancelledAt: null,
    cancellationReasonCode: null,
    completedAt: null,
    completionReasonCode: null,
    createReasonCode: reasonCode,
    createdAt: now,
    createdBy: snapshotActor(input.actor),
    dueAt,
    history: [historyEntry(input.actor, createTransition)],
    idempotencyKey: input.idempotencyKey ?? null,
    priority: input.priority,
    reopenedAt: null,
    reopenReasonCode: null,
    status: 'pending',
    subjectReference: sanitizeSubjectReference(input.subjectReference),
    taskId,
    tenantId: input.tenantId,
    updatedAt: now,
  };

  return { success: true, task, transition: createTransition };
}

export function assignCrmTask(task: CrmTask, input: AssignCrmTaskInput, services: CrmTaskClock) {
  const actorError = validateMutableTaskActor(input.actor, task);
  if (actorError) return actorError;
  if (isCrmTaskMutationBlockedStatus(task.status)) return terminal('terminal_state');
  const assignmentError = validateAssignmentTarget(input.actor, task.tenantId, input.assignedTo);
  if (assignmentError) return assignmentError;
  const assignmentBranchError = validateAssignmentTaskBranch(input.assignedTo, task.branchId);
  if (assignmentBranchError) return assignmentBranchError;
  const reasonError = validateReason(input.reasonCode, CRM_TASK_ASSIGNMENT_REASON_CODES);
  if (reasonError) return reasonError;
  const nextAssignment = sanitizeAssignmentTarget(input.assignedTo);
  if (
    immutableAssignmentMaterial(nextAssignment) === immutableAssignmentMaterial(task.assignedTo)
  ) {
    return { idempotent: true, success: true, task, transition: null };
  }
  const now = normalizeTimestamp(services.now());
  if (!now) return invalid('invalid_timestamp');
  const timestampError = validateMutationTimestamp(task, now);
  if (timestampError) return timestampError;
  const event: CrmTaskTransition['event'] =
    task.assignedTo.kind === 'unassigned' && nextAssignment.kind !== 'unassigned'
      ? 'assigned'
      : 'reassigned';
  const next = transition(event, task.status, task.status, input.reasonCode, now);
  return applyTransition({
    actor: input.actor,
    assignedTo: nextAssignment,
    task,
    transition: next,
  });
}

export function updateCrmTaskDueAt(
  task: CrmTask,
  input: UpdateCrmTaskDueInput,
  services: CrmTaskClock
): CrmTaskMutationResult {
  const actorError = validateMutableTaskActor(input.actor, task);
  if (actorError) return actorError;
  if (isCrmTaskMutationBlockedStatus(task.status)) return terminal('terminal_state');
  const reasonError = validateReason(input.reasonCode, CRM_TASK_DUE_REASON_CODES);
  if (reasonError) return reasonError;
  const dueAt = input.dueAt == null ? null : normalizeTimestamp(input.dueAt);
  if (input.dueAt != null && !dueAt) return invalid('invalid_due_at');
  if (task.dueAt === dueAt) {
    return { idempotent: true, success: true, task, transition: null };
  }
  const now = normalizeTimestamp(services.now());
  if (!now) return invalid('invalid_timestamp');
  const timestampError = validateMutationTimestamp(task, now);
  if (timestampError) return timestampError;
  const next = transition('due_updated', task.status, task.status, input.reasonCode, now);
  return applyTransition({ actor: input.actor, dueAt, task, transition: next });
}

export function startCrmTask(
  task: CrmTask,
  input: StartCrmTaskInput,
  services: CrmTaskClock
): CrmTaskMutationResult {
  const actorError = validateMutableTaskActor(input.actor, task);
  if (actorError) return actorError;
  if (task.status !== 'pending') return terminal('unsupported_transition');
  const reasonCode: CrmTaskStartReasonCode = input.reasonCode ?? 'manual_start';
  const reasonError = validateReason(reasonCode, CRM_TASK_START_REASON_CODES);
  if (reasonError) return reasonError;
  const now = normalizeTimestamp(services.now());
  if (!now) return invalid('invalid_timestamp');
  const timestampError = validateMutationTimestamp(task, now);
  if (timestampError) return timestampError;
  const next = transition('started', 'pending', 'in_progress', reasonCode, now);
  return applyTransition({ actor: input.actor, task, transition: next });
}

export function completeCrmTask(
  task: CrmTask,
  input: CompleteCrmTaskInput,
  services: CrmTaskClock
): CrmTaskMutationResult {
  const actorError = validateMutableTaskActor(input.actor, task);
  if (actorError) return actorError;
  const reasonError = validateReason(input.reasonCode, CRM_TASK_COMPLETION_REASON_CODES);
  if (reasonError) return reasonError;
  if (task.status === 'completed') {
    if (task.completionReasonCode === input.reasonCode) {
      return { idempotent: true, success: true, task, transition: null };
    }
    return terminal('terminal_state');
  }
  if (task.status === 'cancelled') return terminal('terminal_state');
  const now = normalizeTimestamp(services.now());
  if (!now) return invalid('invalid_timestamp');
  const timestampError = validateMutationTimestamp(task, now);
  if (timestampError) return timestampError;
  const next = transition('completed', task.status, 'completed', input.reasonCode, now);
  return applyTransition({
    actor: input.actor,
    completedAt: now,
    completionReasonCode: input.reasonCode,
    task,
    transition: next,
  });
}

export function cancelCrmTask(
  task: CrmTask,
  input: CancelCrmTaskInput,
  services: CrmTaskClock
): CrmTaskMutationResult {
  const actorError = validateMutableTaskActor(input.actor, task);
  if (actorError) return actorError;
  const reasonError = validateReason(input.reasonCode, CRM_TASK_CANCELLATION_REASON_CODES);
  if (reasonError) return reasonError;
  if (task.status === 'cancelled') {
    if (task.cancellationReasonCode === input.reasonCode) {
      return { idempotent: true, success: true, task, transition: null };
    }
    return terminal('terminal_state');
  }
  if (task.status === 'completed') return terminal('terminal_state');
  const now = normalizeTimestamp(services.now());
  if (!now) return invalid('invalid_timestamp');
  const timestampError = validateMutationTimestamp(task, now);
  if (timestampError) return timestampError;
  const next = transition('cancelled', task.status, 'cancelled', input.reasonCode, now);
  return applyTransition({
    actor: input.actor,
    cancellationReasonCode: input.reasonCode,
    cancelledAt: now,
    task,
    transition: next,
  });
}

export function reopenCrmTask(
  task: CrmTask,
  input: ReopenCrmTaskInput,
  services: CrmTaskClock
): CrmTaskMutationResult {
  const actorError = validateMutableTaskActor(input.actor, task);
  if (actorError) return actorError;
  const reasonError = validateReason(input.reasonCode, CRM_TASK_REOPEN_REASON_CODES);
  if (reasonError) return reasonError;
  if (task.status === 'cancelled') return terminal('terminal_state');
  if (task.status !== 'completed') return terminal('unsupported_transition');
  const now = normalizeTimestamp(services.now());
  if (!now) return invalid('invalid_timestamp');
  const timestampError = validateMutationTimestamp(task, now);
  if (timestampError) return timestampError;
  const next = transition('reopened', 'completed', 'in_progress', input.reasonCode, now);
  return applyTransition({
    actor: input.actor,
    completedAt: null,
    completionReasonCode: null,
    reopenedAt: now,
    reopenReasonCode: input.reasonCode,
    task,
    transition: next,
  });
}
