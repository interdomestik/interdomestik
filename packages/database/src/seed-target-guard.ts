const PRODUCTION_PROJECT_REF = 'gunosplgrvnvrftudttr';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

type SeedEnvironment = Readonly<Record<string, string | undefined>>;
type SeedTargetClassification = 'local' | 'confirmed-non-local';

function refuse(classification: string): never {
  throw new Error(`Seed target refused: ${classification}`);
}

function parsedUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function decodedTargetPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function identifiesProduction(url: URL | null): boolean {
  return Boolean(
    url &&
    [url.hostname, url.username].some(value =>
      decodedTargetPart(value).toLowerCase().includes(PRODUCTION_PROJECT_REF)
    )
  );
}

function hasProductionMarker(env: SeedEnvironment): boolean {
  const markers = [
    env.NODE_ENV,
    env.VERCEL_ENV,
    env.SUPABASE_PROJECT_REF,
    env.SUPABASE_REF,
    env.SUPABASE_PROJECT_ID,
  ];
  return markers.some(value => {
    const marker = value?.trim().toLowerCase();
    return marker === 'production' || marker === PRODUCTION_PROJECT_REF;
  });
}

/** Public target identity, never a connection string or credential. */
function confirmationTarget(url: URL): string {
  const hostRef = /^db\.([a-z]{20})\.supabase\.co$/i.exec(url.hostname)?.[1];
  const userRef = /^postgres\.([a-z]{20})$/i.exec(decodeURIComponent(url.username))?.[1];
  return (hostRef ?? userRef ?? url.hostname).toLowerCase();
}

/** Pure preflight: no DB access, logging, environment mutation or production override. */
export function assertSeedTargetAllowed(env: SeedEnvironment): SeedTargetClassification {
  const database = parsedUrl(env.DATABASE_URL);
  const targets = [database, parsedUrl(env.SUPABASE_URL), parsedUrl(env.NEXT_PUBLIC_SUPABASE_URL)];
  // Production evidence wins even when another marker or the DB hostname says local.
  if (hasProductionMarker(env) || targets.some(identifiesProduction)) refuse('production');
  if (!database || !['postgres:', 'postgresql:'].includes(database.protocol)) {
    refuse('invalid');
  }
  if (LOOPBACK_HOSTS.has(database.hostname.toLowerCase())) return 'local';

  let target: string;
  try {
    target = confirmationTarget(database);
  } catch {
    return refuse('invalid');
  }
  if (env.SEED_TARGET_CONFIRM !== `plan070:${target}`) {
    refuse('non-local-unconfirmed');
  }
  return 'confirmed-non-local';
}
