import type { SeedConfig } from '../seed-types';

export async function seedFull(config: SeedConfig) {
  console.log('🌱 Starting Full System Seed (Modular)...');

  try {
    // Dynamic imports to ensure env vars are loaded BEFORE db.ts is evaluated
    const { clearData: cleanup } = await import('./cleanup');
    const { seedTenantsAndBranches } = await import('./tenants');
    const { seedUsersAndAuth } = await import('./users');
    const { seedSubscriptionsAndCommissions } = await import('./memberships');
    const { seedClaimsAndFlows } = await import('./claims');
    const { seedBalkanFlows } = await import('./leads');

    await cleanup();
    await seedTenantsAndBranches();
    await seedUsersAndAuth(config); // Includes creating members
    await seedSubscriptionsAndCommissions(config); // Includes agent assignments logic if we moved it? No, assignments are in users.ts. Subs are here.
    await seedClaimsAndFlows(config);
    await seedBalkanFlows(config);

    console.log('✅ Full System Seed Complete!');
  } catch (error) {
    console.error('❌ Full System Seed Failed:', error);
    throw error; // Re-throw for caller to handle
  }
}

// Pure module - CLI execution removed. Use seed.ts runner only.
