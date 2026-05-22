'use server';

import { completeCrmTaskAction, startCrmTaskAction } from '@/actions/crm-tasks';

type TaskQueueLifecycleAction = 'start' | 'complete';
type TaskQueueLifecycleError = 'unavailable' | 'conflict' | 'rate_limited' | 'transient';

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
