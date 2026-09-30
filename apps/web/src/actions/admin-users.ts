'use server';

import {
  getAgents as getAgentsAction,
  getStaff as getStaffAction,
  getUsers as getUsersAction,
  getUserChoices as getUserChoicesAction,
  resolveTenantClassification as resolveTenantClassificationAction,
  updateUserAgent as updateUserAgentAction,
} from './admin-users.core';

export async function getAgents(
  ...args: Parameters<typeof getAgentsAction>
): ReturnType<typeof getAgentsAction> {
  return getAgentsAction(...args);
}

export async function getStaff(
  ...args: Parameters<typeof getStaffAction>
): ReturnType<typeof getStaffAction> {
  return getStaffAction(...args);
}

export async function getUsers(
  ...args: Parameters<typeof getUsersAction>
): ReturnType<typeof getUsersAction> {
  return getUsersAction(...args);
}

export async function getUserChoices(
  ...args: Parameters<typeof getUserChoicesAction>
): ReturnType<typeof getUserChoicesAction> {
  return getUserChoicesAction(...args);
}

export async function resolveTenantClassification(
  ...args: Parameters<typeof resolveTenantClassificationAction>
): ReturnType<typeof resolveTenantClassificationAction> {
  return resolveTenantClassificationAction(...args);
}

export async function updateUserAgent(
  ...args: Parameters<typeof updateUserAgentAction>
): ReturnType<typeof updateUserAgentAction> {
  return updateUserAgentAction(...args);
}
