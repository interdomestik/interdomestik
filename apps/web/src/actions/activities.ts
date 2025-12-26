'use server';

import { getLeadActivitiesCore } from './activities/get-lead';
import { getMemberActivitiesCore } from './activities/get-member';
import { logLeadActivityCore, type LogLeadActivityInput } from './activities/log-lead';
import { logActivityCore } from './activities/log-member';
import type { LogActivityInput } from './activities/schema';

export type { LogActivityInput } from './activities/schema';

export async function logActivity(data: LogActivityInput) {
  return logActivityCore(data);
}

export async function getMemberActivities(memberId: string) {
  return getMemberActivitiesCore(memberId);
}

export async function logLeadActivity(data: LogLeadActivityInput) {
  return logLeadActivityCore(data);
}

export async function getLeadActivities(leadId: string) {
  return getLeadActivitiesCore(leadId);
}
