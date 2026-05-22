'use server';

import type { CrmTaskExistingMutationGuard } from '@/actions/crm-tasks.core';
import {
  cancelCrmTaskActionWithGuard,
  completeCrmTaskAction,
  reopenCrmTaskActionWithGuard,
  startCrmTaskAction,
  updateCrmTaskDueAtAction,
} from '@/actions/crm-tasks';
import { agentCrmTaskWorkQueueRepository } from '@/adapters/crm/task-work-queue-repository';

import {
  isAgentCrmTaskQueueCancellationReasonCode,
  type AgentCrmTaskQueueCancellationReasonCode,
} from './task-queue-cancellation-reasons';
import {
  isAgentCrmTaskQueueReopenReasonCode,
  type AgentCrmTaskQueueReopenReasonCode,
} from './task-queue-reopen-reasons';

type TaskQueueLifecycleAction = 'start' | 'complete';

type TaskQueueLifecycleError = 'unavailable' | 'conflict' | 'rate_limited' | 'transient';
type TaskQueueDueDateError =
  | 'unavailable'
  | 'invalid_date'
  | 'conflict'
  | 'rate_limited'
  | 'transient';
type TaskQueueCancellationError =
  | 'unavailable'
  | 'invalid_reason'
  | 'conflict'
  | 'rate_limited'
  | 'transient';
type TaskQueueReopenError =
  | 'unavailable'
  | 'invalid_reason'
  | 'conflict'
  | 'terminal'
  | 'rate_limited'
  | 'transient';
type ReasonedTaskQueueInput<TReasonCode extends string> = {
  readonly expectedLifecycleVersion: number;
  readonly reasonCode: TReasonCode;
  readonly taskId: string;
};
type ReasonedTaskQueueParseResult<TReasonCode extends string> =
  | { readonly input: ReasonedTaskQueueInput<TReasonCode>; readonly ok: true }
  | { readonly error: 'invalid_reason' | 'unavailable'; readonly ok: false };
type CancellationParseResult =
  ReasonedTaskQueueParseResult<AgentCrmTaskQueueCancellationReasonCode>;
type ReopenParseResult = ReasonedTaskQueueParseResult<AgentCrmTaskQueueReopenReasonCode>;

export type AgentCrmTaskQueueLifecycleInput = {
  readonly action: TaskQueueLifecycleAction;
  readonly expectedLifecycleVersion: number;
  readonly taskId: string;
};

export type AgentCrmTaskQueueLifecycleResult =
  | {
      readonly action: TaskQueueLifecycleAction;
      readonly success: true;
    }
  | {
      readonly action: TaskQueueLifecycleAction;
      readonly error: TaskQueueLifecycleError;
      readonly success: false;
    };

export type AgentCrmTaskQueueDueDateInput = {
  readonly dueAt: string | null;
  readonly expectedLifecycleVersion: number;
  readonly taskId: string;
};

export type AgentCrmTaskQueueDueDateResult =
  | {
      readonly dueAt: string | null;
      readonly success: true;
    }
  | {
      readonly error: TaskQueueDueDateError;
      readonly success: false;
    };

export type AgentCrmTaskQueueCancellationInput = {
  readonly expectedLifecycleVersion: number;
  readonly reasonCode: AgentCrmTaskQueueCancellationReasonCode;
  readonly taskId: string;
};

export type AgentCrmTaskQueueCancellationResult =
  | {
      readonly reasonCode: AgentCrmTaskQueueCancellationReasonCode;
      readonly success: true;
    }
  | {
      readonly error: TaskQueueCancellationError;
      readonly success: false;
    };

export type AgentCrmTaskQueueReopenInput = {
  readonly expectedLifecycleVersion: number;
  readonly reasonCode: AgentCrmTaskQueueReopenReasonCode;
  readonly taskId: string;
};

export type AgentCrmTaskQueueReopenResult =
  | {
      readonly reasonCode: AgentCrmTaskQueueReopenReasonCode;
      readonly success: true;
    }
  | {
      readonly error: TaskQueueReopenError;
      readonly success: false;
    };

function isTaskQueueLifecycleAction(value: unknown): value is TaskQueueLifecycleAction {
  return value === 'start' || value === 'complete';
}

function parseInput(input: unknown): AgentCrmTaskQueueLifecycleInput | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  if (
    !isTaskQueueLifecycleAction(candidate.action) ||
    typeof candidate.taskId !== 'string' ||
    candidate.taskId.trim().length === 0 ||
    !Number.isInteger(candidate.expectedLifecycleVersion) ||
    Number(candidate.expectedLifecycleVersion) < 0
  ) {
    return null;
  }

  return {
    action: candidate.action,
    expectedLifecycleVersion: Number(candidate.expectedLifecycleVersion),
    taskId: candidate.taskId,
  };
}

function getSafeAction(input: unknown): TaskQueueLifecycleAction {
  if (typeof input === 'object' && input !== null) {
    const action = (input as Record<string, unknown>).action;
    if (isTaskQueueLifecycleAction(action)) {
      return action;
    }
  }

  return 'start';
}

function mapOutcomeToError(outcome: string): TaskQueueLifecycleError {
  if (outcome === 'conflict') {
    return 'conflict';
  }
  if (outcome === 'rate_limited') {
    return 'rate_limited';
  }
  if (outcome === 'repository_failure') {
    return 'transient';
  }
  return 'unavailable';
}

function isValidIsoTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function parseDueDateInput(input: unknown): AgentCrmTaskQueueDueDateInput | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const dueAt = candidate.dueAt;
  if (
    typeof candidate.taskId !== 'string' ||
    candidate.taskId.trim().length === 0 ||
    !Number.isInteger(candidate.expectedLifecycleVersion) ||
    Number(candidate.expectedLifecycleVersion) < 0 ||
    !(dueAt === null || (typeof dueAt === 'string' && isValidIsoTimestamp(dueAt)))
  ) {
    return null;
  }

  return {
    dueAt,
    expectedLifecycleVersion: Number(candidate.expectedLifecycleVersion),
    taskId: candidate.taskId,
  };
}

function parseReasonedTaskQueueInput<TReasonCode extends string>(
  input: unknown,
  isReasonCode: (value: unknown) => value is TReasonCode
): ReasonedTaskQueueParseResult<TReasonCode> {
  if (typeof input !== 'object' || input === null) {
    return { error: 'unavailable', ok: false };
  }

  const candidate = input as Record<string, unknown>;
  if (
    typeof candidate.taskId !== 'string' ||
    candidate.taskId.trim().length === 0 ||
    !Number.isInteger(candidate.expectedLifecycleVersion) ||
    Number(candidate.expectedLifecycleVersion) < 0
  ) {
    return { error: 'unavailable', ok: false };
  }

  if (!isReasonCode(candidate.reasonCode)) {
    return { error: 'invalid_reason', ok: false };
  }

  return {
    input: {
      expectedLifecycleVersion: Number(candidate.expectedLifecycleVersion),
      reasonCode: candidate.reasonCode,
      taskId: candidate.taskId,
    },
    ok: true,
  };
}

function parseCancellationInput(input: unknown): CancellationParseResult {
  return parseReasonedTaskQueueInput(input, isAgentCrmTaskQueueCancellationReasonCode);
}

function parseReopenInput(input: unknown): ReopenParseResult {
  return parseReasonedTaskQueueInput(input, isAgentCrmTaskQueueReopenReasonCode);
}

function mapDueDateOutcomeToError(outcome: string, reason?: string): TaskQueueDueDateError {
  if (outcome === 'conflict') {
    return 'conflict';
  }
  if (outcome === 'rate_limited') {
    return 'rate_limited';
  }
  if (outcome === 'repository_failure') {
    return 'transient';
  }
  if (outcome === 'invalid_input' && reason === 'invalid_due_at') {
    return 'invalid_date';
  }
  return 'unavailable';
}

function mapReasonedMutationOutcomeToError(
  outcome: string,
  reason?: string
): Exclude<TaskQueueReopenError, 'terminal'> {
  if (outcome === 'conflict') {
    return 'conflict';
  }
  if (outcome === 'rate_limited') {
    return 'rate_limited';
  }
  if (outcome === 'repository_failure') {
    return 'transient';
  }
  if (outcome === 'invalid_input' && reason === 'invalid_reason_code') {
    return 'invalid_reason';
  }
  if (outcome === 'invalid_input' && reason === 'unsupported_transition') {
    return 'conflict';
  }
  return 'unavailable';
}

function mapCancellationOutcomeToError(
  outcome: string,
  reason?: string
): TaskQueueCancellationError {
  return mapReasonedMutationOutcomeToError(outcome, reason);
}

function mapReopenOutcomeToError(outcome: string, reason?: string): TaskQueueReopenError {
  if (outcome === 'conflict') {
    return reason === 'terminal_state' ? 'terminal' : 'conflict';
  }
  return mapReasonedMutationOutcomeToError(outcome, reason);
}

const requireVisibleAgentTaskQueueRow: CrmTaskExistingMutationGuard = async ({ actor, input }) => {
  try {
    const queue = await agentCrmTaskWorkQueueRepository.readAgentTaskWorkQueue({
      actor,
      now: new Date().toISOString(),
    });
    const row = queue.find(item => item.taskId === input.taskId);

    if (!row) {
      return { outcome: 'forbidden', reason: 'task_not_in_queue' };
    }

    if (row.lifecycleVersion !== input.expectedLifecycleVersion) {
      return { outcome: 'conflict', reason: 'lifecycle_conflict' };
    }

    return null;
  } catch {
    return { outcome: 'repository_failure', reason: 'repository_failure' };
  }
};

const requireVisibleAgentCompletedTaskQueueRow: CrmTaskExistingMutationGuard = async ({
  actor,
  input,
}) => {
  try {
    const queue = await agentCrmTaskWorkQueueRepository.readAgentCompletedTaskQueue({
      actor,
      now: new Date().toISOString(),
    });
    const row = queue.find(item => item.taskId === input.taskId);

    if (!row) {
      return { outcome: 'forbidden', reason: 'task_not_in_completed_queue' };
    }

    if (row.lifecycleVersion !== input.expectedLifecycleVersion) {
      return { outcome: 'conflict', reason: 'lifecycle_conflict' };
    }

    return null;
  } catch {
    return { outcome: 'repository_failure', reason: 'repository_failure' };
  }
};

export async function submitAgentCrmTaskQueueLifecycleAction(
  input: AgentCrmTaskQueueLifecycleInput
): Promise<AgentCrmTaskQueueLifecycleResult> {
  const parsedInput = parseInput(input);
  if (parsedInput === null) {
    return { action: getSafeAction(input), error: 'unavailable', success: false };
  }

  try {
    const result =
      parsedInput.action === 'start'
        ? await startCrmTaskAction({
            expectedLifecycleVersion: parsedInput.expectedLifecycleVersion,
            reasonCode: 'manual_start',
            taskId: parsedInput.taskId,
          })
        : await completeCrmTaskAction({
            expectedLifecycleVersion: parsedInput.expectedLifecycleVersion,
            reasonCode: 'resolved',
            taskId: parsedInput.taskId,
          });

    if (result.outcome === 'success' || result.outcome === 'idempotent_replay') {
      return { action: parsedInput.action, success: true };
    }

    return {
      action: parsedInput.action,
      error: mapOutcomeToError(result.outcome),
      success: false,
    };
  } catch {
    return { action: parsedInput.action, error: 'transient', success: false };
  }
}

export async function submitAgentCrmTaskQueueDueDateAction(
  input: AgentCrmTaskQueueDueDateInput
): Promise<AgentCrmTaskQueueDueDateResult> {
  const parsedInput = parseDueDateInput(input);
  if (parsedInput === null) {
    return { error: 'invalid_date', success: false };
  }

  try {
    const result = await updateCrmTaskDueAtAction({
      dueAt: parsedInput.dueAt,
      expectedLifecycleVersion: parsedInput.expectedLifecycleVersion,
      reasonCode: parsedInput.dueAt === null ? 'due_date_cleared' : 'due_date_changed',
      taskId: parsedInput.taskId,
    });

    if (result.outcome === 'success' || result.outcome === 'idempotent_replay') {
      return { dueAt: parsedInput.dueAt, success: true };
    }

    return {
      error: mapDueDateOutcomeToError(result.outcome, result.reason),
      success: false,
    };
  } catch {
    return { error: 'transient', success: false };
  }
}

export async function submitAgentCrmTaskQueueCancellationAction(
  input: AgentCrmTaskQueueCancellationInput
): Promise<AgentCrmTaskQueueCancellationResult> {
  const parsed = parseCancellationInput(input);
  if (!parsed.ok) {
    return { error: parsed.error, success: false };
  }
  const parsedInput = parsed.input;

  try {
    const result = await cancelCrmTaskActionWithGuard(
      {
        expectedLifecycleVersion: parsedInput.expectedLifecycleVersion,
        reasonCode: parsedInput.reasonCode,
        taskId: parsedInput.taskId,
      },
      requireVisibleAgentTaskQueueRow
    );

    if (result.outcome === 'success' || result.outcome === 'idempotent_replay') {
      return { reasonCode: parsedInput.reasonCode, success: true };
    }

    return {
      error: mapCancellationOutcomeToError(result.outcome, result.reason),
      success: false,
    };
  } catch {
    return { error: 'transient', success: false };
  }
}

export async function submitAgentCrmTaskQueueReopenAction(
  input: AgentCrmTaskQueueReopenInput
): Promise<AgentCrmTaskQueueReopenResult> {
  const parsed = parseReopenInput(input);
  if (!parsed.ok) {
    return { error: parsed.error, success: false };
  }
  const parsedInput = parsed.input;

  try {
    const result = await reopenCrmTaskActionWithGuard(
      {
        expectedLifecycleVersion: parsedInput.expectedLifecycleVersion,
        reasonCode: parsedInput.reasonCode,
        taskId: parsedInput.taskId,
      },
      requireVisibleAgentCompletedTaskQueueRow
    );

    if (result.outcome === 'success' || result.outcome === 'idempotent_replay') {
      return { reasonCode: parsedInput.reasonCode, success: true };
    }

    return {
      error: mapReopenOutcomeToError(result.outcome, result.reason),
      success: false,
    };
  } catch {
    return { error: 'transient', success: false };
  }
}
