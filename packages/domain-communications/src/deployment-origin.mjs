// Destination configuration only. This module grants no routing, tenant or auth authority.
const PRODUCTION_ORIGIN = 'https://ida.interdomestik.com';
const STAGING_ORIGIN = 'https://staging.interdomestik.com';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', 'ida.localhost', 'ida.127.0.0.1.nip.io']);
const DOOR_HOSTS = new Set([
  new URL(PRODUCTION_ORIGIN).hostname,
  new URL(STAGING_ORIGIN).hostname,
  ...LOCAL_HOSTS,
]);
const ALIAS_KEYS = ['KS_HOST', 'MK_HOST', 'AL_HOST', 'PILOT_HOST'];
const ALIAS_LABELS = ['ks', 'mk', 'al', 'pilot'];
const HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/i;

function refuse(key) {
  throw new Error(`Invalid deployment origin configuration: ${key}`);
}

function deploymentEnvironment(value) {
  if (value !== 'production' && value !== 'staging' && value !== 'local') {
    refuse('INTERDOMESTIK_DEPLOY_ENV');
  }
  return value;
}

function inferEnvironment(env) {
  const vercel = { production: 'production', preview: 'staging', development: 'local' }[
    env.VERCEL_ENV
  ];
  if (env.VERCEL_ENV && !vercel) refuse('VERCEL_ENV');
  const override = env.INTERDOMESTIK_DEPLOY_ENV
    ? deploymentEnvironment(env.INTERDOMESTIK_DEPLOY_ENV)
    : undefined;
  if (vercel && override && vercel !== override) refuse('INTERDOMESTIK_DEPLOY_ENV');
  // The attested-image lane is not a Vercel build; a canonical staging URL identifies it.
  const staging =
    env.NEXT_PUBLIC_APP_URL &&
    parseUrl(env.NEXT_PUBLIC_APP_URL, 'NEXT_PUBLIC_APP_URL').origin === STAGING_ORIGIN;
  return vercel ?? override ?? (staging ? 'staging' : 'local');
}

function parseUrl(raw, key, auth = false) {
  // Check the source spelling too: URL silently removes dot segments and empty ?/# parts.
  const match = typeof raw === 'string' && /^(https?):\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(raw);
  if (!match || /[\s\\%]/u.test(match[2]) || /[\s\\]/u.test(raw)) refuse(key);
  const path = match[3] ?? '/';
  if (path !== '/' && !(auth && (path === '/api/auth' || path === '/api/auth/'))) refuse(key);
  let url;
  try {
    url = new URL(raw);
  } catch {
    refuse(key);
  }
  if (url.username || url.password || !HOST_PATTERN.test(url.hostname)) refuse(key);
  return url;
}

function validateDoor(environment, raw) {
  const url = parseUrl(raw, 'NEXT_PUBLIC_APP_URL');
  if (environment === 'production' && url.origin !== PRODUCTION_ORIGIN) refuse('production_door');
  if (environment === 'staging' && url.origin !== STAGING_ORIGIN) refuse('staging_door');
  if (environment === 'local' && !LOCAL_HOSTS.has(url.hostname)) refuse('local_door');
  return url.origin;
}

function parseHost(raw, key, protocol = 'https:') {
  if (typeof raw !== 'string' || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(raw)) refuse(key);
  const url = parseUrl(`${protocol}//${raw}`, key);
  // Host admission ignores ports and the DNS root dot; collision checks must do so too.
  return { hostname: url.hostname.replace(/\.$/u, ''), host: url.host.replace(/\.(?=:|$)/u, '') };
}

function validateVercelSignals(env, environment) {
  const expected = {
    production: { env: ['production'], target: ['production'] },
    staging: { env: ['preview'], target: ['preview', 'staging'] },
    local: { env: ['development'], target: ['development'] },
  }[environment];
  if (env.VERCEL_ENV && !expected.env.includes(env.VERCEL_ENV)) refuse('VERCEL_ENV');
  if (env.VERCEL_TARGET_ENV && !expected.target.includes(env.VERCEL_TARGET_ENV)) {
    refuse('VERCEL_TARGET_ENV');
  }
}

function validateHosts(env, environment, origin, requireIda = true) {
  const door = new URL(origin);
  if (environment === 'staging' && requireIda && env.IDA_HOST !== 'staging.interdomestik.com')
    refuse('IDA_HOST');
  // Local IDA_HOST belongs to routing; Playwright supplies it alongside a loopback app URL.
  if (environment !== 'local' && env.IDA_HOST !== undefined) {
    const configured = parseHost(env.IDA_HOST, 'IDA_HOST', door.protocol);
    if (configured.host !== door.host) refuse('IDA_HOST');
  }

  // Include retained aliases so an override cannot impersonate another alias with no override.
  const aliases = new Map();
  for (const [index, label] of ALIAS_LABELS.entries()) {
    for (const suffix of ['interdomestik.com', 'localhost', '127.0.0.1.nip.io']) {
      aliases.set(`${label}.${suffix}`, ALIAS_KEYS[index]);
    }
  }
  for (const key of ALIAS_KEYS) {
    if (env[key] === undefined) continue;
    const { hostname } = parseHost(env[key], key);
    if (
      DOOR_HOSTS.has(hostname) ||
      hostname === door.hostname ||
      (aliases.has(hostname) && aliases.get(hostname) !== key)
    ) {
      refuse(key);
    }
    aliases.set(hostname, key);
  }
}

function resolveConfiguration(env, build = false) {
  const environment = inferEnvironment(env);
  validateVercelSignals(env, environment);
  const origin = validateDoor(environment, env.NEXT_PUBLIC_APP_URL);
  // Non-Vercel image builds do not receive auth/IDA inputs. Runtime always requires them.
  const requireRuntimeInputs = !build || Boolean(env.VERCEL_ENV);
  if (
    (requireRuntimeInputs || env.BETTER_AUTH_URL !== undefined) &&
    parseUrl(env.BETTER_AUTH_URL, 'BETTER_AUTH_URL', true).origin !== origin
  )
    refuse('BETTER_AUTH_URL');
  if (
    env.NEXT_PUBLIC_SITE_URL !== undefined &&
    parseUrl(env.NEXT_PUBLIC_SITE_URL, 'NEXT_PUBLIC_SITE_URL').origin !== origin
  ) {
    refuse('NEXT_PUBLIC_SITE_URL');
  }
  validateHosts(env, environment, origin, requireRuntimeInputs);
  return Object.freeze({ environment, origin });
}

/** Strict destination validation, including production. No request or browser authority. */
export function resolveDeploymentOrigin(env = process.env) {
  return resolveConfiguration(env);
}

/** Optional public snapshot: incomplete/placeholder builds must remain buildable. */
export function captureDeploymentOriginSnapshot(env = process.env) {
  try {
    return resolveConfiguration(env, true);
  } catch {
    return Object.freeze({});
  }
}

/** Validate only public values embedded by next.config; never include server config in clients. */
export function validateDeploymentOriginSnapshot(snapshot) {
  const environment = deploymentEnvironment(snapshot.environment);
  const origin = validateDoor(environment, snapshot.origin);
  if (origin !== snapshot.origin) refuse('build_origin');
  return Object.freeze({ environment, origin });
}

/** Runtime configuration must match the artifact selected at build time. */
export function assertDeploymentOriginMatchesBuild(env, snapshot) {
  const runtime = resolveDeploymentOrigin(env);
  if (!snapshot.environment && !snapshot.origin) return runtime;
  const built = validateDeploymentOriginSnapshot(snapshot);
  if (built.environment !== runtime.environment || built.origin !== runtime.origin) {
    refuse('build_runtime_mismatch');
  }
  return runtime;
}
