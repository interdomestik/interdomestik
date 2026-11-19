export const DATABASE_ENV_KEYS = Object.freeze([
  'DATABASE_URL',
  'DATABASE_URL_RLS',
  'E2E_DATABASE_URL',
  'E2E_DATABASE_URL_RLS',
]);
// Tenant hosts and the base URL the Playwright projects build their origins from.
export const HOST_ENV_KEYS = Object.freeze([
  'KS_HOST',
  'MK_HOST',
  'AL_HOST',
  'PILOT_HOST',
  'IDA_HOST',
]);
export const GUARDED_ENV_KEYS = Object.freeze([
  ...DATABASE_ENV_KEYS,
  ...HOST_ENV_KEYS,
  'PW_PORT',
  'PORT',
  'PLAYWRIGHT_BASE_URL',
  'SENTRY_AUTH_TOKEN',
]);
// A local env file is any file outside git named `.env` or `.env.<suffix>`; `.envrc` is not one.
const LOCAL_ENV_FILE = /(?:^|\/)\.env(?:\.[^/]*)?$/u;
// libpq reads PG* (PGHOST, PGPORT, PGOPTIONS, PGSERVICE ...) and dotenv reads DOTENV_CONFIG_*.
const REDIRECTING_ENV_NAME = /^(?:PG|DOTENV_)/u;
const LOOPBACK_ORIGIN =
  /^(?:127\.0\.0\.1|localhost|\[::1\]|(?:[a-z0-9-]+\.)*127\.0\.0\.1\.nip\.io|(?:[a-z0-9-]+\.)*localhost)$/u;

/**
 * Every local env file in the checkout, ignored or untracked. The gatekeeper, the build, the E2E
 * server and package loaders each read env files their own way, so gate runs allow none at all
 * rather than parse them. Ignored directories are listed whole, never descended into.
 */
export function localEnvFiles(repoRoot, exec) {
  const listing = exec('git', ['ls-files', '--others', '--directory'], repoRoot);
  return listing.split('\n').filter(file => LOCAL_ENV_FILE.test(file));
}

/** Names (never values) of variables through which libpq or dotenv could redirect a run. */
export function redirectingEnvNames(env) {
  return Object.keys(env)
    .filter(name => REDIRECTING_ENV_NAME.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function databaseUrlErrors(key, raw, database, forbiddenPorts) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return [`${key} is not a URL`];
  }
  const errors = [];
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) errors.push(`${key} is not postgres`);
  // An explicit port only: without one, drivers fall back to PGPORT or their own default.
  if (!url.port) return [...errors, `${key} must name its port`];
  const port = Number(url.port);
  if (forbiddenPorts.includes(port)) errors.push(`${key} uses forbidden port ${port}`);
  const host = url.hostname.replace(/^\[(.*)\]$/u, '$1');
  if (host !== database.host) errors.push(`${key} host is not ${database.host}`);
  if (port !== database.port) errors.push(`${key} port is not ${database.port}`);
  if (url.pathname !== `/${database.name}`) errors.push(`${key} database is not ${database.name}`);
  return errors;
}

function originErrors(key, raw, appPort) {
  let url;
  try {
    url = new URL(raw.includes('://') ? raw : `http://${raw}`);
  } catch {
    return [`${key} is not a host:port`];
  }
  const errors = [];
  if (Number(url.port) !== appPort) errors.push(`${key} does not use port ${appPort}`);
  if (!LOOPBACK_ORIGIN.test(url.hostname)) errors.push(`${key} is not a loopback host`);
  return errors;
}

function appPortErrors(key, port, marker) {
  if (marker.forbidden_ports.includes(port)) return [`${key} uses forbidden port ${port}`];
  return port === marker.app_port ? [] : [`${key} is not ${marker.app_port}`];
}

// Keys whose emptiness the required checks already report, and a token that may be blank.
const EMPTY_ALLOWED = new Set(['DATABASE_URL', 'PW_PORT', 'SENTRY_AUTH_TOKEN']);

/** A set-but-empty key is not absent: some steps keep it, others fall back to a default. */
function emptyValueErrors(env) {
  return GUARDED_ENV_KEYS.filter(key => env[key] === '' && !EMPTY_ALLOWED.has(key)).map(
    key => `${key} is set but empty; unset it or give it the marker's value`
  );
}

function sourceErrors({ localFiles = [], redirecting = [] }) {
  return [
    ...localFiles.map(
      file => `${file} exists; gate runs take settings only from the checked environment`
    ),
    ...redirecting.map(name => `${name} is set; libpq and dotenv settings can redirect the run`),
  ];
}

/** The effective database, app and upload settings the gate steps will read. */
export function environmentErrors(marker, env, sources = {}) {
  const forbidden = marker.forbidden_ports;
  const errors = [...sourceErrors(sources), ...emptyValueErrors(env)];
  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL must be set; the default fallback is the shared database on 54322');
  }
  for (const key of DATABASE_ENV_KEYS) {
    if (env[key]) errors.push(...databaseUrlErrors(key, env[key], marker.database, forbidden));
  }
  if (!env.PW_PORT) errors.push(`PW_PORT must be set to ${marker.app_port}`);
  for (const key of ['PW_PORT', 'PORT']) {
    if (env[key]) errors.push(...appPortErrors(key, Number(env[key]), marker));
  }
  for (const key of [...HOST_ENV_KEYS, 'PLAYWRIGHT_BASE_URL']) {
    if (env[key]) errors.push(...originErrors(key, env[key], marker.app_port));
  }
  if (env.SENTRY_AUTH_TOKEN) errors.push('SENTRY_AUTH_TOKEN must be unset for gate evidence');
  return errors;
}
