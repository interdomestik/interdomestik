'use server';
import {
  getLeadActivities,
  getMemberActivities,
  logActivity,
  logLeadActivity,
} from './activities.core';

export type { LogActivityInput } from './activities.core';
export { getLeadActivities, getMemberActivities, logActivity, logLeadActivity };
