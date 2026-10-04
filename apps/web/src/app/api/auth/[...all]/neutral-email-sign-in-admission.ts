/**
 * Route-local admission for the neutral single password-login entry.
 *
 * Admission is an exact host-identity decision only. It never derives a tenant, never widens the
 * loose `isKnownIdaFrontDoorHost('ida.anything')` recognition, never admits country/pilot
 * compatibility aliases and never derives an allowed host from the incoming request. Credential,
 * origin and session verification stay with the auth provider.
 *
 * The decision is three-state on purpose. A request that merely *looks* like the neutral entry but
 * fails exact admission is reported as a rejected candidate so the caller can fail closed, instead
 * of falling through to the loose legacy host resolver and authenticating on a matching tenant
 * cookie. Hosts that are not neutral candidates at all (country aliases, loopback, unrelated
 * unknown hosts) keep their established behaviour.
 */
import { isKnownIdaFrontDoorHost } from '@/lib/tenant/tenant-front-door';
import { resolveTenantContextFromSources } from '@/lib/tenant/tenant-hosts';

type HostAuthority = { hostname: string; port: number | null; authority: string };

const CANONICAL_NEUTRAL_HOSTNAMES: ReadonlySet<string> = new Set([
  'interdomestik.com',
  'www.interdomestik.com',
  'app.interdomestik.com',
  'ida.interdomestik.com',
  'staging.interdomestik.com',
  'interdomestik-web.vercel.app',
]);

// Native local browser entry keeps its configured development port; these names only resolve to
// loopback, so the port suffix stays free while the hostname remains exact.
const LOCAL_NEUTRAL_HOSTNAMES: ReadonlySet<string> = new Set([
  'ida.localhost',
  'ida.127.0.0.1.nip.io',
]);

const CONFIGURED_NEUTRAL_HOST_ENV_KEYS = [
  'IDA_HOST',
  'VERCEL_URL',
  'BETTER_AUTH_URL',
  'NEXT_PUBLIC_APP_URL',
] as const;

type NeutralSignInHostEnvKey = (typeof CONFIGURED_NEUTRAL_HOST_ENV_KEYS)[number];

export type NeutralSignInHostEnv = Partial<Record<NeutralSignInHostEnvKey, string | undefined>>;

// Ambient `process.env` is not directly assignable to this narrow option bag, so the configured
// values are read through one explicit snapshot. Literal key access keeps build-time substitution
// intact, the required record keeps the snapshot aligned with the key list, and the exported
// function keeps taking a plain injectable value.
function readConfiguredNeutralHostEnv(): Record<NeutralSignInHostEnvKey, string | undefined> {
  return {
    IDA_HOST: process.env.IDA_HOST,
    VERCEL_URL: process.env.VERCEL_URL,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

function parseHostAuthority(raw: string | null | undefined): HostAuthority | null {
  const value = raw?.trim();
  if (!value || /[,/@\\?#\s]/.test(value) || value.includes('://')) return null;

  const match = /^([a-z\d](?:[a-z\d.-]*[a-z\d])?\.?)(?::(\d{1,5}))?$/i.exec(value);
  if (!match) return null;

  const hostname = match[1]!.toLowerCase().replace(/\.$/, '');
  const port = match[2] ? Number(match[2]) : null;
  if (!hostname || (port !== null && (port < 1 || port > 65535))) return null;

  return { hostname, port, authority: port === null ? hostname : `${hostname}:${port}` };
}

function parseConfiguredAuthority(raw: string | undefined): HostAuthority | null {
  const value = raw?.trim();
  if (!value) return null;
  if (!value.includes('://')) return parseHostAuthority(value);

  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return parseHostAuthority(url.host);
  } catch {
    return null;
  }
}

function isAdmittedNeutralAuthority(direct: HostAuthority, env: NeutralSignInHostEnv): boolean {
  if (CANONICAL_NEUTRAL_HOSTNAMES.has(direct.hostname)) return direct.port === null;
  if (LOCAL_NEUTRAL_HOSTNAMES.has(direct.hostname)) return true;

  return CONFIGURED_NEUTRAL_HOST_ENV_KEYS.some(
    key => parseConfiguredAuthority(env[key])?.authority === direct.authority
  );
}

function isCompatibilityAliasHost(host: string): boolean {
  return resolveTenantContextFromSources({ host }).source === 'compatibility_alias';
}

function isExactNeutralEntryRequest(
  rawDirect: string | null,
  rawForwarded: string | null,
  env: NeutralSignInHostEnv
): boolean {
  const direct = parseHostAuthority(rawDirect);
  if (!direct) return false;

  // A country/pilot compatibility alias keeps its own tenant contract and cutover behaviour even
  // when it is also present in configured host values.
  if (isCompatibilityAliasHost(direct.authority)) return false;
  if (!isAdmittedNeutralAuthority(direct, env)) return false;

  if (rawForwarded === null) return true;

  return parseHostAuthority(rawForwarded)?.authority === direct.authority;
}

/**
 * Lenient hostname used only to recognize a *candidate* for the neutral entry. It deliberately
 * accepts the shapes exact admission rejects — comma splices, scheme/userinfo/path noise and any
 * port — so those requests can fail closed instead of falling through to the loose legacy host
 * resolver. It never admits anything on its own.
 */
function lenientNeutralHostname(raw: string | null | undefined): string {
  const first = raw?.split(',')[0]?.trim() ?? '';
  const withoutScheme = first.replace(/^[a-z][a-z\d+.-]*:\/\//i, '');
  const withoutUserInfo = withoutScheme.slice(withoutScheme.lastIndexOf('@') + 1);
  const authority = withoutUserInfo.split(/[/\\?#]/)[0] ?? '';
  return authority.replace(/:\d*$/, '').trim().toLowerCase().replace(/\.$/, '');
}

function configuredNeutralHostnames(env: NeutralSignInHostEnv): string[] {
  return CONFIGURED_NEUTRAL_HOST_ENV_KEYS.map(
    key => parseConfiguredAuthority(env[key])?.hostname
  ).filter((hostname): hostname is string => hostname !== undefined);
}

function isNeutralEntryCandidateHostname(hostname: string, env: NeutralSignInHostEnv): boolean {
  if (!hostname) return false;
  if (isCompatibilityAliasHost(hostname)) return false;

  return (
    CANONICAL_NEUTRAL_HOSTNAMES.has(hostname) ||
    LOCAL_NEUTRAL_HOSTNAMES.has(hostname) ||
    configuredNeutralHostnames(env).includes(hostname) ||
    // Loose legacy `ida.*` recognition identifies a candidate that must fail closed. It is never an
    // admission source.
    isKnownIdaFrontDoorHost(hostname)
  );
}

export type NeutralSignInHostDecision =
  'admitted' | 'rejected_neutral_candidate' | 'not_a_neutral_candidate';

/**
 * Classifies a sign-in request against the neutral entry.
 *
 * `admitted` requires an exact configured/canonical neutral entry host whose direct `Host` and any
 * `x-forwarded-host` agree unambiguously; a missing direct host is never admitted. Any other
 * recognizable neutral candidate — including a canonical host carrying a comma splice, an added
 * port, a disagreeing forwarded host, a forwarded-only neutral claim or loose `ida.*` recognition —
 * is a rejected candidate that the caller must terminate.
 */
export function resolveNeutralEmailSignInHost(
  headers: Headers,
  env: NeutralSignInHostEnv = readConfiguredNeutralHostEnv()
): NeutralSignInHostDecision {
  const rawDirect = headers.get('host');
  const rawForwarded = headers.get('x-forwarded-host');

  // An alias direct host owns the request outright, so a forwarded neutral claim cannot turn it
  // into a neutral candidate.
  const directHostname = lenientNeutralHostname(rawDirect);
  if (directHostname && isCompatibilityAliasHost(directHostname)) {
    return 'not_a_neutral_candidate';
  }

  const isCandidate =
    isNeutralEntryCandidateHostname(directHostname, env) ||
    isNeutralEntryCandidateHostname(lenientNeutralHostname(rawForwarded), env);
  if (!isCandidate) return 'not_a_neutral_candidate';

  return isExactNeutralEntryRequest(rawDirect, rawForwarded, env)
    ? 'admitted'
    : 'rejected_neutral_candidate';
}
