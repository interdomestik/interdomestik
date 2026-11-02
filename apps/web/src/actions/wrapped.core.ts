'use server';

import { getActionContext } from './wrapped/context';
import { getWrappedStatsCore } from './wrapped/get';

export async function getWrappedStats() {
  const { session, authority } = await getActionContext();
  return getWrappedStatsCore({ session, authority });
}
