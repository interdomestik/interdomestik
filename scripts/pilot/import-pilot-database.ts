import { assertSeedTargetAllowed } from '../../packages/database/src/seed-target-guard';

export async function importPilotDatabase(): Promise<typeof import('@interdomestik/database')> {
  assertSeedTargetAllowed(process.env);
  const database = await import('@interdomestik/database');
  assertSeedTargetAllowed(process.env);
  return database;
}
