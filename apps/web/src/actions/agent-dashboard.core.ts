'use server';

import { getActionContext } from './agent-dashboard/context';
import { getAgentDashboardDataCore } from './agent-dashboard/get';
export type { AgentStats } from './agent-dashboard/types';

export async function getAgentDashboardData() {
  const { session } = await getActionContext();
  return getAgentDashboardDataCore({ session });
}
