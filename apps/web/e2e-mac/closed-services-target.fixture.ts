import { readDisposableTargetClass } from '@interdomestik/database/seed-target-classification';

export function assertClosedServicesDatabase() {
  // The Mac lane supplies a dedicated seeded database, server port and loopback mail catcher.
  const ownerUrl = process.env.E2E_DATABASE_URL?.trim();
  if (!ownerUrl) {
    throw new Error('Closed services require E2E_DATABASE_URL for a dedicated loopback database');
  }

  // The built server derives its restricted role from the owner URL. Fixtures still need to read
  // the same switch rows if a separate runtime URL was configured.
  const defaultPort = process.env.PGPORT || '5432';
  for (const runtimeUrl of [
    process.env.DATABASE_URL_RLS,
    process.env.E2E_SERVER_DATABASE_URL_RLS?.trim() || ownerUrl,
  ]) {
    const targetEnv = { ...process.env, DATABASE_URL: ownerUrl, DATABASE_URL_RLS: runtimeUrl };
    if (!runtimeUrl || readDisposableTargetClass(targetEnv) !== 'local') {
      throw new Error('Closed services require loopback database URLs');
    }
    const ownerTarget = new URL(ownerUrl);
    const runtimeTarget = new URL(runtimeUrl);
    if (
      ownerTarget.pathname.length <= 1 ||
      ownerTarget.pathname !== runtimeTarget.pathname ||
      (ownerTarget.port || defaultPort) !== (runtimeTarget.port || defaultPort)
    ) {
      throw new Error('Closed services require fixture and server roles on the same database');
    }
  }
}
