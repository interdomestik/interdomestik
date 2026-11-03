'use server';

import { getActionContext } from './analytics/context';
import { getAdminAnalyticsCore } from './analytics/get-admin';
export type { AnalyticsData } from './analytics/types';

export async function getAdminAnalytics() {
  const { session, authority } = await getActionContext();
  return getAdminAnalyticsCore({ session, authority });
}
