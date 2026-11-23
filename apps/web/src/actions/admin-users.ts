'use server';

import {
  resolveTenantClassification as resolveTenantClassificationAction,
  updateUserAgent as updateUserAgentAction,
} from './admin-users.core';

export { getAgents, getStaff, getUsers, getUserChoices } from './admin-users.core';

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
