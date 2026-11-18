/**
 * Hosts a hosted deployment may serve sign-in from and send sign-in or reset links to. Each
 * environment has its own exact list: production trusts only the one door, staging only its own
 * hosts, and neither trusts the other's names, a generated hosting name or a name pattern
 * (SEC-11). Anything that is not clearly a staging deployment gets the production list, which
 * names no foreign host.
 */
const PRODUCTION_AUTH_HOSTS: readonly string[] = ['ida.interdomestik.com'] as const;

const STAGING_AUTH_HOSTS: readonly string[] = [
  'staging.interdomestik.com',
  'ks.staging.interdomestik.com',
  'mk.staging.interdomestik.com',
] as const;

export type HostedAuthEnvironment = 'production' | 'staging';

export function isHostedDeployment(): boolean {
  return process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL?.trim());
}

export function hostedAuthEnvironment(): HostedAuthEnvironment {
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  const targetEnv = process.env.VERCEL_TARGET_ENV?.trim();
  return vercelEnv === 'preview' && (!targetEnv || targetEnv === 'preview')
    ? 'staging'
    : 'production';
}

export function hostedAuthHosts(environment = hostedAuthEnvironment()): readonly string[] {
  return environment === 'staging' ? [...STAGING_AUTH_HOSTS] : [...PRODUCTION_AUTH_HOSTS];
}

function httpsOriginOnList(raw: string | undefined, hosts: readonly string[]): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return hosts.includes(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The origin a hosted deployment issues auth links from: the configured URL when its host is on
 * this environment's list, otherwise the list's first host. A misconfigured URL can therefore
 * never move links to a host the environment does not trust.
 */
export function hostedAuthOrigin(environment = hostedAuthEnvironment()): string {
  const hosts = hostedAuthHosts(environment);
  return (
    httpsOriginOnList(process.env.BETTER_AUTH_URL, hosts) ??
    httpsOriginOnList(process.env.NEXT_PUBLIC_APP_URL, hosts) ??
    `https://${hosts[0]}`
  );
}

/** Keeps only https origins whose host is on this environment's list. */
export function filterHostedOrigins(
  origins: readonly string[],
  environment = hostedAuthEnvironment()
): string[] {
  const hosts = hostedAuthHosts(environment);
  return origins.flatMap(origin => {
    const allowed = httpsOriginOnList(origin, hosts);
    return allowed ? [allowed] : [];
  });
}
