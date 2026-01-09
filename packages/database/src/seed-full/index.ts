import './load-env'; // Must be first to ensure env vars are loaded before DB connection

async function seedFull() {
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
    await seedUsersAndAuth(); // Includes creating members
    await seedSubscriptionsAndCommissions(); // Includes agent assignments logic if we moved it? No, assignments are in users.ts. Subs are here.
    await seedClaimsAndFlows();
    await seedBalkanFlows();

    console.log('✅ Full System Seed Complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Full System Seed Failed:', error);
    process.exit(1);
  }
}

seedFull();
