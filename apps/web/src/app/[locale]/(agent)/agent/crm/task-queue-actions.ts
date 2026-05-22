'use server';

import {
  completeCrmTaskAction,
  startCrmTaskAction,
  updateCrmTaskDueAtAction,
} from '@/actions/crm-tasks';

type TaskQueueLifecycleAction = 'start' | 'complete';
type TaskQueueLifecycleError = 'unavailable' | 'conflict' | 'rate_limited' | 'transient';
type TaskQueueDueDateError =
  | 'unavailable'
  | 'invalid_date'
  | 'conflict'
  | 'rate_limited'
  | 'transient';

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
