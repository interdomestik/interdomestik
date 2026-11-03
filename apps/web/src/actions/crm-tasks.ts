'use server';

import { headers } from 'next/headers';

import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import {
  assignCrmTaskCore,
  cancelCrmTaskCore,
  completeCrmTaskCore,
  createCrmTaskCore,
  readCrmTaskCore,
  reopenCrmTaskCore,
  startCrmTaskCore,
  updateCrmTaskDueAtCore,
  updateCrmTaskPriorityCore,
  type AssignCrmTaskCoreInput,
  type CancelCrmTaskCoreInput,
  type CompleteCrmTaskCoreInput,
  type CreateCrmTaskCoreInput,
  type CrmTaskExistingMutationGuard,
  type ReopenCrmTaskCoreInput,
  type StartCrmTaskCoreInput,
  type UpdateCrmTaskDueAtCoreInput,
  type UpdateCrmTaskPriorityCoreInput,
} from './crm-tasks.core';

async function getActionSession() {
  const requestHeaders = await headers();
  let authorized: Awaited<ReturnType<typeof authorizeSessionTenant>> = null;
  try {
    authorized = await authorizeSessionTenant(requestHeaders);
  } catch (error) {
    // A session without a tenant is unauthorized, as it was before the authority producer.
    if ((error as { name?: unknown } | null)?.name !== 'MissingTenantError') throw error;
  }
  return {
    authority: authorized?.authority ?? null,
    requestHeaders,
    session: authorized?.session ?? null,
  };
}

export async function readCrmTaskAction(taskId: string) {
  const { authority, requestHeaders, session } = await getActionSession();
  return readCrmTaskCore({ authority, requestHeaders, session, taskId });
}

export async function createCrmTaskAction(input: CreateCrmTaskCoreInput) {
  const { authority, requestHeaders, session } = await getActionSession();
  return createCrmTaskCore({ input, authority, requestHeaders, session });
}

export async function assignCrmTaskAction(input: AssignCrmTaskCoreInput) {
  const { authority, requestHeaders, session } = await getActionSession();
  return assignCrmTaskCore({ input, authority, requestHeaders, session });
}

export async function updateCrmTaskDueAtAction(input: UpdateCrmTaskDueAtCoreInput) {
  const { authority, requestHeaders, session } = await getActionSession();
  return updateCrmTaskDueAtCore({ input, authority, requestHeaders, session });
}

export async function updateCrmTaskPriorityAction(input: UpdateCrmTaskPriorityCoreInput) {
  const { authority, requestHeaders, session } = await getActionSession();
  return updateCrmTaskPriorityCore({ input, authority, requestHeaders, session });
}

export async function updateCrmTaskPriorityActionWithGuard(
  input: UpdateCrmTaskPriorityCoreInput,
  guard: CrmTaskExistingMutationGuard
) {
  const { authority, requestHeaders, session } = await getActionSession();
  return updateCrmTaskPriorityCore({ guard, input, authority, requestHeaders, session });
}

export async function startCrmTaskAction(input: StartCrmTaskCoreInput) {
  const { authority, requestHeaders, session } = await getActionSession();
  return startCrmTaskCore({ input, authority, requestHeaders, session });
}

export async function completeCrmTaskAction(input: CompleteCrmTaskCoreInput) {
  const { authority, requestHeaders, session } = await getActionSession();
  return completeCrmTaskCore({ input, authority, requestHeaders, session });
}

export async function cancelCrmTaskAction(input: CancelCrmTaskCoreInput) {
  const { authority, requestHeaders, session } = await getActionSession();
  return cancelCrmTaskCore({ input, authority, requestHeaders, session });
}

export async function cancelCrmTaskActionWithGuard(
  input: CancelCrmTaskCoreInput,
  guard: CrmTaskExistingMutationGuard
) {
  const { authority, requestHeaders, session } = await getActionSession();
  return cancelCrmTaskCore({ guard, input, authority, requestHeaders, session });
}

export async function reopenCrmTaskAction(input: ReopenCrmTaskCoreInput) {
  const { authority, requestHeaders, session } = await getActionSession();
  return reopenCrmTaskCore({ input, authority, requestHeaders, session });
}

export async function reopenCrmTaskActionWithGuard(
  input: ReopenCrmTaskCoreInput,
  guard: CrmTaskExistingMutationGuard
) {
  const { authority, requestHeaders, session } = await getActionSession();
  return reopenCrmTaskCore({ guard, input, authority, requestHeaders, session });
}
