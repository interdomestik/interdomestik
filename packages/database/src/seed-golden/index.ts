/**
 * Contract:
 * - seed:golden is immutable and baseline-only
 * - seed:workload is additive and self-cleaning
 * - seeds must never reference each other's IDs
 *
 * Transaction boundary:
 * - This preserves the historical non-transactional seed flow. Each extracted
 *   step uses the same shared db client and awaits sequentially in this file.
 */
import { inArray, sql } from 'drizzle-orm';
import type { SeedConfig } from '../seed-types';
import { cleanupByPrefixes } from '../seed-utils/cleanup';
import { seedAgentAssignments } from './agent-assignments';
import { seedAgentSettings } from './agent-settings';
import { seedClaims } from './claims';
import { seedLeads } from './leads';
import { seedMemberCounters } from './member-counters';
import { seedMemberships } from './memberships';
import { seedTenants, seedBranches } from './tenants-branches';
import { seedTrackingTokens } from './tracking-tokens';
import type { SeedGoldenContext, SeedGoldenStepName } from './types';
import { seedUsers } from './users';

export { buildSeededMembershipCardIdentifiers } from './membership-cards';

export const SEED_GOLDEN_STEP_ORDER: readonly SeedGoldenStepName[] = [
  'cleanup',
  'tenants',
  'branches',
  'users',
  'agent-assignments',
  'memberships',
  'agent-settings',
  'claims',
  'leads',
  'tracking-tokens',
  'member-counters',
] as const;

export interface SeedGoldenModules {
  cleanup(context: SeedGoldenContext): Promise<void>;
  tenants(context: SeedGoldenContext): Promise<void>;
  branches(context: SeedGoldenContext): Promise<void>;
  users(context: SeedGoldenContext): Promise<void>;
  agentAssignments(context: SeedGoldenContext): Promise<void>;
  memberships(context: SeedGoldenContext): Promise<void>;
  agentSettings(context: SeedGoldenContext): Promise<void>;
  claims(context: SeedGoldenContext): Promise<void>;
  leads(context: SeedGoldenContext): Promise<void>;
  trackingTokens(context: SeedGoldenContext): Promise<void>;
  memberCounters(context: SeedGoldenContext): Promise<void>;
}

export const seedGoldenModules: SeedGoldenModules = {
  cleanup: async ({ db, schema }) => {
    await cleanupByPrefixes(db, schema, ['golden_', 'pack_ks_', 'member_']);
    await db
      .delete(schema.claims)
      .where(inArray(schema.claims.claimNumber, ['CLM-MK-2026-000001', 'CLM-XK-2026-800001']));
  },
  tenants: seedTenants,
  branches: seedBranches,
  users: seedUsers,
  agentAssignments: seedAgentAssignments,
  memberships: seedMemberships,
  agentSettings: seedAgentSettings,
  claims: seedClaims,
  leads: seedLeads,
  trackingTokens: seedTrackingTokens,
  memberCounters: seedMemberCounters,
};

export async function runSeedGoldenSteps(
  context: SeedGoldenContext,
  modules: SeedGoldenModules = seedGoldenModules
) {
  await modules.cleanup(context);
  await modules.tenants(context);
  await modules.branches(context);
  await modules.users(context);
  await modules.agentAssignments(context);
  await modules.memberships(context);
  console.log('📝 Seeding Claims Pack (Ops Verification)...');
  await modules.agentSettings(context);
  await modules.claims(context);
  await modules.leads(context);
  await modules.trackingTokens(context);
  await modules.memberCounters(context);
}

export async function seedGolden(config: SeedConfig) {
  console.log('🌱 Starting Golden Seed (Baseline)...');

  const { db } = await import('../db');
  const schema = await import('../schema');

  await runSeedGoldenSteps({ at: config.at, db, schema, sql });

  console.log('✅ Golden Seed Baseline & KS Pack Complete!');
}

// Pure module - CLI execution removed. Use seed.ts runner only.
