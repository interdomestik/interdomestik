import type { CrmActorContext, CrmActorRole } from '../context';

export const CRM_TASK_SUBJECT_KINDS = [
  'lead',
  'deal',
  'account',
  'contact',
  'support_handoff',
] as const;
export type CrmTaskSubjectKind = (typeof CRM_TASK_SUBJECT_KINDS)[number];

export const CRM_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number];

export const CRM_TASK_TERMINAL_STATUSES = ['completed', 'cancelled'] as const;
export type CrmTaskTerminalStatus = (typeof CRM_TASK_TERMINAL_STATUSES)[number];

export const CRM_TASK_MUTATION_BLOCKED_STATUSES = CRM_TASK_TERMINAL_STATUSES;
export type CrmTaskMutationBlockedStatus = CrmTaskTerminalStatus;

export const CRM_TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type CrmTaskPriority = (typeof CRM_TASK_PRIORITIES)[number];

export const CRM_TASK_MUTATION_ROLES = ['agent', 'staff', 'branch_manager', 'admin'] as const;
export type CrmTaskMutationRole = (typeof CRM_TASK_MUTATION_ROLES)[number];

export const CRM_TASK_ASSIGNABLE_ROLES = ['agent', 'staff', 'branch_manager', 'admin'] as const;
export type CrmTaskAssignableRole = (typeof CRM_TASK_ASSIGNABLE_ROLES)[number];

export const CRM_TASK_EVENT_KINDS = [
  'created',
  'assigned',
  'reassigned',
  'due_updated',
  'priority_updated',
  'started',
  'completed',
  'cancelled',
  'reopened',
] as const;
export type CrmTaskEventKind = (typeof CRM_TASK_EVENT_KINDS)[number];

export const CRM_TASK_CREATE_REASON_CODES = [
  'manual',
  'follow_up',
  'support_handoff',
  'assistance_review',
  'data_quality',
] as const;
export type CrmTaskCreateReasonCode = (typeof CRM_TASK_CREATE_REASON_CODES)[number];

export const CRM_TASK_ASSIGNMENT_REASON_CODES = [
  'manual_assignment',
  'reassignment',
  'workload_balance',
] as const;
export type CrmTaskAssignmentReasonCode = (typeof CRM_TASK_ASSIGNMENT_REASON_CODES)[number];

export const CRM_TASK_DUE_REASON_CODES = ['due_date_changed', 'due_date_cleared'] as const;
export type CrmTaskDueReasonCode = (typeof CRM_TASK_DUE_REASON_CODES)[number];

export const CRM_TASK_PRIORITY_REASON_CODES = ['manual_priority_change'] as const;
export type CrmTaskPriorityReasonCode = (typeof CRM_TASK_PRIORITY_REASON_CODES)[number];

export const CRM_TASK_START_REASON_CODES = ['manual_start'] as const;
export type CrmTaskStartReasonCode = (typeof CRM_TASK_START_REASON_CODES)[number];

export const CRM_TASK_COMPLETION_REASON_CODES = [
  'resolved',
  'no_longer_needed',
  'duplicate',
  'converted',
  'manually_closed',
] as const;
export type CrmTaskCompletionReasonCode = (typeof CRM_TASK_COMPLETION_REASON_CODES)[number];

export const CRM_TASK_CANCELLATION_REASON_CODES = [
  'not_needed',
  'duplicate',
  'created_in_error',
  'subject_closed',
] as const;
export type CrmTaskCancellationReasonCode = (typeof CRM_TASK_CANCELLATION_REASON_CODES)[number];

export const CRM_TASK_REOPEN_REASON_CODES = [
  'follow_up_required',
  'incomplete',
  'manually_reopened',
] as const;
export type CrmTaskReopenReasonCode = (typeof CRM_TASK_REOPEN_REASON_CODES)[number];

export type CrmTaskSubjectReference = {
  readonly id: string;
  readonly kind: CrmTaskSubjectKind;
};

export type CrmTaskSubjectProof = {
  readonly branchId?: string | null;
  readonly subjectReference: CrmTaskSubjectReference;
  readonly tenantId: string;
};

export type CrmTaskActorSnapshot = {
  readonly actorId: string;
  readonly branchId?: string | null;
  readonly role: CrmActorRole;
  readonly tenantId: string;
};

export type CrmTaskAssignmentTarget =
  | { readonly kind: 'unassigned' }
  | {
      readonly actorId: string;
      readonly branchId?: string | null;
      readonly kind: 'actor';
      readonly role: CrmTaskAssignableRole;
      readonly tenantId?: string | null;
    }
  | {
      readonly branchId?: string | null;
      readonly kind: 'role';
      readonly role: CrmTaskAssignableRole;
      readonly tenantId?: string | null;
    }
  | {
      readonly branchId?: string | null;
      readonly kind: 'team';
      readonly teamId: string;
      readonly tenantId?: string | null;
    };

export type CrmTaskHistoryEntry = {
  readonly actor: CrmTaskActorSnapshot;
  readonly event: CrmTaskEventKind;
  readonly fromStatus: CrmTaskStatus | null;
  readonly reasonCode:
    | CrmTaskAssignmentReasonCode
    | CrmTaskCancellationReasonCode
    | CrmTaskCompletionReasonCode
    | CrmTaskCreateReasonCode
    | CrmTaskDueReasonCode
    | CrmTaskPriorityReasonCode
    | CrmTaskReopenReasonCode
    | CrmTaskStartReasonCode;
  readonly timestamp: string;
  readonly toStatus: CrmTaskStatus;
};

export type CrmTask = {
  readonly assignedTo: CrmTaskAssignmentTarget;
  readonly branchId: string | null;
  readonly cancelledAt: string | null;
  readonly cancellationReasonCode: CrmTaskCancellationReasonCode | null;
  readonly completedAt: string | null;
  readonly completionReasonCode: CrmTaskCompletionReasonCode | null;
  readonly createReasonCode: CrmTaskCreateReasonCode;
  readonly createdAt: string;
  readonly createdBy: CrmTaskActorSnapshot;
  readonly dueAt: string | null;
  readonly history: readonly CrmTaskHistoryEntry[];
  readonly idempotencyKey: string | null;
  readonly lifecycleVersion: number;
  readonly priority: CrmTaskPriority;
  readonly reopenedAt: string | null;
  readonly reopenReasonCode: CrmTaskReopenReasonCode | null;
  readonly status: CrmTaskStatus;
  readonly subjectReference: CrmTaskSubjectReference;
  readonly taskId: string;
  readonly tenantId: string;
  readonly updatedAt: string;
};

export type CrmTaskTransition = {
  readonly event: CrmTaskEventKind;
  readonly fromStatus: CrmTaskStatus | null;
  readonly reasonCode: CrmTaskHistoryEntry['reasonCode'];
  readonly timestamp: string;
  readonly toStatus: CrmTaskStatus;
};

export type CrmTaskMutationError =
  | 'forbidden'
  | 'idempotent_conflict'
  | 'invalid_input'
  | 'not_found'
  | 'repository_failure'
  | 'terminal_state';

export type CrmTaskMutationDenialReason =
  | 'actor_scope'
  | 'assignment_scope'
  | 'branch_scope'
  | 'duplicate_idempotency_conflict'
  | 'invalid_assignment_target'
  | 'invalid_due_at'
  | 'invalid_idempotency_key'
  | 'invalid_priority'
  | 'invalid_reason_code'
  | 'invalid_subject_reference'
  | 'invalid_task_id'
  | 'invalid_timestamp'
  | 'non_monotonic_timestamp'
  | 'role_scope'
  | 'subject_not_found'
  | 'subject_not_visible'
  | 'subject_proof_missing'
  | 'tenant_scope'
  | 'terminal_state'
  | 'unsupported_transition';

export type CrmTaskMutationResult =
  | {
      readonly idempotent?: false;
      readonly success: true;
      readonly task: CrmTask;
      readonly transition: CrmTaskTransition;
    }
  | {
      readonly idempotent: true;
      readonly success: true;
      readonly task: CrmTask;
      readonly transition: null;
    }
  | {
      readonly error: CrmTaskMutationError;
      readonly reason: CrmTaskMutationDenialReason;
      readonly success: false;
    };

export type CrmTaskClock = {
  now(): string;
};

export type CrmTaskIds = {
  taskId(): string;
};

export type CreateCrmTaskInput = {
  actor: CrmActorContext;
  assignedTo: CrmTaskAssignmentTarget;
  createReasonCode?: CrmTaskCreateReasonCode;
  dueAt?: string | null;
  existingTask?: CrmTask | null;
  idempotencyKey?: string | null;
  priority: CrmTaskPriority;
  subjectProof: CrmTaskSubjectProof;
  subjectReference: CrmTaskSubjectReference;
  taskId?: string | null;
  tenantId: string;
};

export type AssignCrmTaskInput = {
  actor: CrmActorContext;
  assignedTo: CrmTaskAssignmentTarget;
  reasonCode: CrmTaskAssignmentReasonCode;
};

export type UpdateCrmTaskDueInput = {
  actor: CrmActorContext;
  dueAt: string | null;
  reasonCode: CrmTaskDueReasonCode;
};

export type UpdateCrmTaskPriorityInput = {
  actor: CrmActorContext;
  priority: CrmTaskPriority;
  reasonCode: CrmTaskPriorityReasonCode;
};

export type StartCrmTaskInput = {
  actor: CrmActorContext;
  reasonCode?: CrmTaskStartReasonCode;
};

export type CompleteCrmTaskInput = {
  actor: CrmActorContext;
  reasonCode: CrmTaskCompletionReasonCode;
};

export type CancelCrmTaskInput = {
  actor: CrmActorContext;
  reasonCode: CrmTaskCancellationReasonCode;
};

export type ReopenCrmTaskInput = {
  actor: CrmActorContext;
  reasonCode: CrmTaskReopenReasonCode;
};
