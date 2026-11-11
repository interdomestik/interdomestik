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

function validateHosts(env, environment, origin) {
  const door = new URL(origin);
  if (environment === 'staging' && env.IDA_HOST !== 'staging.interdomestik.com') refuse('IDA_HOST');
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

function resolveConfiguration(env) {
  const environment = inferEnvironment(env);
  validateVercelSignals(env, environment);
  const origin = validateDoor(environment, env.NEXT_PUBLIC_APP_URL);
  if (parseUrl(env.BETTER_AUTH_URL, 'BETTER_AUTH_URL', true).origin !== origin)
    refuse('BETTER_AUTH_URL');
  if (
    env.NEXT_PUBLIC_SITE_URL !== undefined &&
    parseUrl(env.NEXT_PUBLIC_SITE_URL, 'NEXT_PUBLIC_SITE_URL').origin !== origin
  ) {
    refuse('NEXT_PUBLIC_SITE_URL');
  }
  validateHosts(env, environment, origin);
  return Object.freeze({ environment, origin });
}

/** Strict destination validation, including production. No request or browser authority. */
export function resolveDeploymentOrigin(env = process.env) {
  return resolveConfiguration(env);
}

/** Validate the existing public app URL without granting routing or server authority. */
export function resolvePublicDeploymentOrigin(raw) {
  const { origin } = parseUrl(raw, 'NEXT_PUBLIC_APP_URL');
  let environment = 'local';
  if (origin === PRODUCTION_ORIGIN) environment = 'production';
  else if (origin === STAGING_ORIGIN) environment = 'staging';
  return Object.freeze({ environment, origin: validateDoor(environment, raw) });
}
