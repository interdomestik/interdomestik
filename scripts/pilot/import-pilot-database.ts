import {
  closeSeedTlsClients,
  hasInstalledSeedTlsClients,
  installSeedTlsClients,
} from '../../packages/database/src/seed-target-tls';

export async function importPilotDatabase(): Promise<typeof import('@interdomestik/database')> {
  const requireRlsIntegration = process.env.REQUIRE_RLS_INTEGRATION;
  if (
    (requireRlsIntegration !== undefined && requireRlsIntegration !== '0') ||
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error('Pilot writers refuse REQUIRE_RLS_INTEGRATION/production database imports');
  }
  const { assertSeedTargetAllowed } = await import('../../packages/database/src/seed-target-guard');
  try {
    if (
      assertSeedTargetAllowed(process.env) === 'confirmed-non-local' &&
      !hasInstalledSeedTlsClients()
    ) {
      installSeedTlsClients(process.env);
    }
    const database = await import('@interdomestik/database');
    assertSeedTargetAllowed(process.env);
    return database;
  } catch (error) {
    await closeSeedTlsClients();
    throw error;
  }
}

export async function closePilotDatabase(): Promise<void> {
  const { closeSeedTargetClients } = await import('../../packages/database/src/seed-target-guard');
  await closeSeedTargetClients();
}
