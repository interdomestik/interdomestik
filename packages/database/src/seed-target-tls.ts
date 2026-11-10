import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { checkServerIdentity } from 'node:tls';
import postgres from 'postgres';

const ROOT_CERT = 'SEED_TARGET_SSL_ROOT_CERT';
type SeedEnvironment = Readonly<Record<string, string | undefined>>;
const seedGlobal = globalThis as typeof globalThis & {
  queryClientAdmin?: postgres.Sql;
  queryClientRls?: postgres.Sql;
};
const ownedClients = new Set<postgres.Sql>();
let installed: { admin: postgres.Sql; rls: postgres.Sql } | undefined;

/** Repeated seed steps may use only the exact pair this module installed. */
export function hasInstalledSeedTlsClients(): boolean {
  return (
    installed !== undefined &&
    seedGlobal.queryClientAdmin === installed.admin &&
    seedGlobal.queryClientRls === installed.rls
  );
}

export async function closeSeedTlsClients(): Promise<void> {
  const clients = [...ownedClients];
  ownedClients.clear();
  installed = undefined;
  if (clients.includes(seedGlobal.queryClientAdmin!)) delete seedGlobal.queryClientAdmin;
  if (clients.includes(seedGlobal.queryClientRls!)) delete seedGlobal.queryClientRls;
  const results = await Promise.allSettled(clients.map(client => client.end({ timeout: 5 })));
  if (results.some(result => result.status === 'rejected')) {
    throw new Error('Seed target cleanup failed');
  }
}

function readCaBundle(path: string): string {
  if (!isAbsolute(path)) throw new Error('Invalid CA path');
  const pem = readFileSync(path, 'utf8');
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (
    !certificates?.length ||
    pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()
  ) {
    throw new Error('Invalid CA bundle');
  }
  for (const certificate of certificates) new X509Certificate(certificate);
  return pem;
}

function parseEnvInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function transportOptions(
  databaseUrl: string,
  ca: string,
  env: SeedEnvironment
): postgres.Options<{}> {
  return {
    max: parseEnvInt(env.DB_MAX_CONNECTIONS, 10),
    idle_timeout: parseEnvInt(env.DB_IDLE_TIMEOUT, 20),
    connect_timeout: parseEnvInt(env.DB_CONNECT_TIMEOUT, 10),
    max_lifetime: parseEnvInt(env.DB_MAX_LIFETIME, 1800),
    onnotice: () => undefined,
    ssl: {
      ca,
      rejectUnauthorized: true,
      servername: new URL(databaseUrl).hostname.toLowerCase(),
      checkServerIdentity,
    },
  };
}

/** Call only after a confirmed-non-local preflight, before importing database capabilities. */
export function installSeedTlsClients(env: SeedEnvironment): void {
  if (seedGlobal.queryClientAdmin != null || seedGlobal.queryClientRls != null) {
    throw new Error('Seed target refused: non-local-tls');
  }
  try {
    const root = env[ROOT_CERT];
    if (!root) throw new Error('Missing CA selection');
    const ca = readCaBundle(root);
    const adminUrl = env.DATABASE_URL!;
    const rlsUrl = env.DATABASE_URL_RLS ?? adminUrl;
    // Validate both configurations before constructing either lazy client.
    const adminOptions = transportOptions(adminUrl, ca, env);
    const rlsOptions = transportOptions(rlsUrl, ca, env);
    const admin = postgres(adminUrl, adminOptions);
    ownedClients.add(admin);
    const rls = rlsUrl === adminUrl ? admin : postgres(rlsUrl, rlsOptions);
    ownedClients.add(rls);
    seedGlobal.queryClientAdmin = admin;
    seedGlobal.queryClientRls = rls;
    installed = { admin, rls };
  } catch {
    // Never attach filesystem/OpenSSL errors: they may include paths or certificate contents.
    throw new Error('Seed target refused: non-local-tls');
  }
}
