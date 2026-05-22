'use server';

import { headers } from 'next/headers';

import { auth } from '@/lib/auth';

import {
  assignCrmTaskCore,
  cancelCrmTaskCore,
  completeCrmTaskCore,
  createCrmTaskCore,
  readCrmTaskCore,
  reopenCrmTaskCore,
  startCrmTaskCore,
  updateCrmTaskDueAtCore,
  type AssignCrmTaskCoreInput,
  type CancelCrmTaskCoreInput,
  type CompleteCrmTaskCoreInput,
  type CreateCrmTaskCoreInput,
  type CrmTaskExistingMutationGuard,
  type ReopenCrmTaskCoreInput,
  type StartCrmTaskCoreInput,
  type UpdateCrmTaskDueAtCoreInput,
} from './crm-tasks.core';

async function getActionSession() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return { requestHeaders, session };
}

export async function readCrmTaskAction(taskId: string) {
  const { requestHeaders, session } = await getActionSession();
  return readCrmTaskCore({ requestHeaders, session, taskId });
}

export async function createCrmTaskAction(input: CreateCrmTaskCoreInput) {
  const { requestHeaders, session } = await getActionSession();
  return createCrmTaskCore({ input, requestHeaders, session });
}

export async function assignCrmTaskAction(input: AssignCrmTaskCoreInput) {
  const { requestHeaders, session } = await getActionSession();
  return assignCrmTaskCore({ input, requestHeaders, session });
}

export async function updateCrmTaskDueAtAction(input: UpdateCrmTaskDueAtCoreInput) {
  const { requestHeaders, session } = await getActionSession();
  return updateCrmTaskDueAtCore({ input, requestHeaders, session });
}

export async function startCrmTaskAction(input: StartCrmTaskCoreInput) {
  const { requestHeaders, session } = await getActionSession();
  return startCrmTaskCore({ input, requestHeaders, session });
}

export async function completeCrmTaskAction(input: CompleteCrmTaskCoreInput) {
  const { requestHeaders, session } = await getActionSession();
  return completeCrmTaskCore({ input, requestHeaders, session });
}

export async function cancelCrmTaskAction(input: CancelCrmTaskCoreInput) {
  const { requestHeaders, session } = await getActionSession();
  return cancelCrmTaskCore({ input, requestHeaders, session });
}

export async function cancelCrmTaskActionWithGuard(
  input: CancelCrmTaskCoreInput,
  guard: CrmTaskExistingMutationGuard
) {
  const { requestHeaders, session } = await getActionSession();
  return cancelCrmTaskCore({ guard, input, requestHeaders, session });
}

export async function reopenCrmTaskAction(input: ReopenCrmTaskCoreInput) {
  const { requestHeaders, session } = await getActionSession();
  return reopenCrmTaskCore({ input, requestHeaders, session });
}

export async function reopenCrmTaskActionWithGuard(
  input: ReopenCrmTaskCoreInput,
  guard: CrmTaskExistingMutationGuard
) {
  const { requestHeaders, session } = await getActionSession();
  return reopenCrmTaskCore({ guard, input, requestHeaders, session });
}
