import { cleanupByPrefixes } from '../seed-utils/cleanup';
import { WORKLOAD_PREFIX } from './constants';

export async function cleanupWorkload(db: any, schema: any) {
  console.log(`🧹 Cleaning up workload data with prefix: ${WORKLOAD_PREFIX}...`);
  const { like } = await import('drizzle-orm');

  // Explicitly clean up commissions first to avoid FK constraint on subscriptions
  await db
    .delete(schema.agentCommissions)
    .where(like(schema.agentCommissions.id, `${WORKLOAD_PREFIX}%`));

  await cleanupByPrefixes(db, schema, [WORKLOAD_PREFIX], false);
}
