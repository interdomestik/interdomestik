/**
 * Contract:
 * - seed:golden is immutable and baseline-only
 * - seed:workload is additive and self-cleaning
 * - seeds must never reference each other's IDs
 */
async function assertNoGoldenMutation(db: any, initialCount?: number): Promise<number> {
  const { sql } = await import('drizzle-orm');
  const result = await db.execute(sql`SELECT count(*) FROM "user" WHERE id LIKE 'golden_%'`);
  const currentCount = Number(result[0].count);

  if (initialCount !== undefined && currentCount !== initialCount) {
    throw new Error(
      `🚨 VIOLATION: Golden data mutated! Expected ${initialCount} golden users, found ${currentCount}.`
    );
  }
  return currentCount;
}

import type { SeedConfig } from '../seed-types';

export async function seedWorkload(config: SeedConfig) {
  console.log('🚀 Starting Workload Seed...');

  // Dynamic imports to ensure ENV is loaded
  const { db } = await import('../db');
  const schema = await import('../schema');

  // Runtime Assertion: Baseline
  const baselineGoldenUsers = await assertNoGoldenMutation(db);

  const { cleanupWorkload } = await import('./cleanup');
  const { upsertTenantsAndBranches } = await import('./tenants-branches');
  const { seedWorkloadUsers } = await import('./users');
  const { seedWorkloadMemberships } = await import('./memberships');
  const { seedWorkloadClaims } = await import('./claims');
  const { seedWorkloadLeads } = await import('./leads');
  const { seedWorkloadCommissions } = await import('./commissions');

  try {
    // 1. Cleanup
    await cleanupWorkload(db, schema);

    // 2. Tenants & Branches
    await upsertTenantsAndBranches(db, schema);

    // 3. Users
    const { agents, staff, members } = await seedWorkloadUsers(db, schema, config);

    // 4. Memberships
    const { subscriptions } = await seedWorkloadMemberships(db, schema, members, agents, config);

    // 5. Claims
    await seedWorkloadClaims(db, schema, members, staff, config);

    // 6. Leads
    await seedWorkloadLeads(db, schema, agents, config);

    // 7. Commissions
    await seedWorkloadCommissions(db, schema, subscriptions, agents, config);

    // Runtime Assertion: Verify No Mutation
    await assertNoGoldenMutation(db, baselineGoldenUsers);

    console.log('\n✨ Workload Seed Complete!');
    console.log('Summary:');
    console.log(
      `- Users: ${agents.length} agents, ${staff.length} staff, ${members.length} members`
    );
    console.log(`- Branches: 3 KS, 2 MK`);
    console.log(`- Claims: 45 KS, 25 MK`);
    console.log(`- Leads: 5 KS, 8 MK`);
  } catch (error) {
    console.error('❌ Workload Seed Failed:', error);
    throw error; // Re-throw for caller to handle
  }
}

// Pure module - CLI execution removed. Use seed.ts runner only.
