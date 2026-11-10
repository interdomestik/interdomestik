export async function importPilotDatabase(): Promise<typeof import('@interdomestik/database')> {
  const requireRlsIntegration = process.env.REQUIRE_RLS_INTEGRATION;
  if (
    (requireRlsIntegration !== undefined && requireRlsIntegration !== '0') ||
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error('Pilot writers refuse REQUIRE_RLS_INTEGRATION/production database imports');
  }
  const { assertSeedTargetAllowed } = await import('../../packages/database/src/seed-target-guard');
  assertSeedTargetAllowed(process.env);
  const database = await import('@interdomestik/database');
  assertSeedTargetAllowed(process.env);
  return database;
}
