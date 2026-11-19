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
// Settings of the Mac verify isolation besides the guarded ones; their values are checked too.
export const ISOLATION_ENV_KEYS = Object.freeze([
  'PLAYWRIGHT_BROWSERS_PATH',
  'INTERDOMESTIK_TASK_OWNS_PORT',
  'SKIP_DOCKER_DOCTOR',
  // The E2E server's bind host.
  'HOSTNAME',
]);
// Every variable that names a database URL is checked, not only the four above: the E2E server,
// admin and contract helpers read their own (E2E_SERVER_DATABASE_URL_RLS, E2E_DATABASE_URL_ADMIN).
const DATABASE_URL_NAME = /DATABASE_URL/u;

/** The keys the gate reads from the environment: the guarded list plus every database URL. */
export function checkedEnvKeys(env) {
  const databaseKeys = Object.keys(env).filter(key => DATABASE_URL_NAME.test(key));
  return [...new Set([...GUARDED_ENV_KEYS, ...ISOLATION_ENV_KEYS, ...databaseKeys])];
}
const LOOPBACK_ORIGIN =
  /^(?:127\.0\.0\.1|localhost|\[::1\]|(?:[a-z0-9-]+\.)*127\.0\.0\.1\.nip\.io|(?:[a-z0-9-]+\.)*localhost)$/u;
// One form that the installed driver and libpq both read the same way: a lowercase scheme, an
// optional user[:password] of plain or percent-encoded characters, one lowercase host name (no
// IPv6 literal), an explicit decimal port, one plain database name and nothing after it. Anything
// looser (several `@` or hosts, `?options`, `#`, a stray `%`) is read differently by some driver.
const STRICT_DATABASE_URL =
  /^postgres(?:ql)?:\/\/(?:((?:[\w.~-]|%[0-9A-Fa-f]{2})*(?::(?:[\w.~-]|%[0-9A-Fa-f]{2})*)?)@)?([a-z0-9.-]+):(\d{1,5})\/([\w-]+)$/u;

// Percent-encoded user information must decode to valid UTF-8 (or a driver throws on it) with no
// control character (libpq refuses `%00`, and drivers treat line breaks differently).
function isControl(character) {
  const code = character.codePointAt(0);
  return code < 0x20 || code === 0x7f;
}

function plainUserinfo(userinfo = '') {
  try {
    return userinfo.split(':').every(part => ![...decodeURIComponent(part)].some(isControl));
  } catch {
    return false;
  }
}
// Playwright builds `http://<value>/<locale>` from a tenant host, so it must be a bare host:port.
const TENANT_HOST = /^(\[::1\]|[a-z0-9.-]+):(\d{1,5})$/iu;
const BASE_URL = /^http:\/\/(\[::1\]|[a-z0-9.-]+):(\d{1,5})\/?$/iu;
// Playwright accepts only decimal digits for PW_PORT and PORT.
const DECIMAL_PORT = /^\d{1,5}$/u;

function databaseUrlErrors(key, raw, database, forbiddenPorts) {
  const match = STRICT_DATABASE_URL.exec(raw);
  if (!match || !plainUserinfo(match[1])) {
    return [`${key} must be postgresql://[user[:password]@]host:port/database and nothing else`];
  }
  const [, , host, rawPort, name] = match;
  const errors = [];
  const port = Number(rawPort);
  if (forbiddenPorts.includes(port)) errors.push(`${key} uses forbidden port ${port}`);
  if (host !== database.host) errors.push(`${key} host is not ${database.host}`);
  if (port !== database.port) errors.push(`${key} port is not ${database.port}`);
  if (name !== database.name) errors.push(`${key} database is not ${database.name}`);
  return errors;
}

function originErrors(key, raw, appPort) {
  const match = (key === 'PLAYWRIGHT_BASE_URL' ? BASE_URL : TENANT_HOST).exec(raw);
  if (!match) {
    const form = key === 'PLAYWRIGHT_BASE_URL' ? 'http://host:port' : 'a bare host:port';
    return [`${key} must be ${form}`];
  }
  const [, host, port] = match;
  const errors = [];
  if (Number(port) !== appPort) errors.push(`${key} does not use port ${appPort}`);
  if (!LOOPBACK_ORIGIN.test(host.toLowerCase())) errors.push(`${key} is not a loopback host`);
  return errors;
}

function appPortErrors(key, raw, marker) {
  if (!DECIMAL_PORT.test(raw)) return [`${key} must be a decimal port`];
  const port = Number(raw);
  if (marker.forbidden_ports.includes(port)) return [`${key} uses forbidden port ${port}`];
  return port === marker.app_port ? [] : [`${key} is not ${marker.app_port}`];
}

// Keys whose emptiness the required checks already report, and a token that may be blank.
const EMPTY_ALLOWED = new Set(['DATABASE_URL', 'PW_PORT', 'SENTRY_AUTH_TOKEN']);

/** A set-but-empty key is not absent: some steps keep it, others fall back to a default. */
function emptyValueErrors(env) {
  return checkedEnvKeys(env)
    .filter(key => env[key] === '' && !EMPTY_ALLOWED.has(key))
    .map(key => `${key} is set but empty; unset it or give it the marker's value`);
}

function sourceErrors({ localFiles = [], unsearched = [], unexpected = [] }) {
  return [
    ...localFiles.map(
      file => `${file} exists; gate runs take settings only from the checked environment`
    ),
    ...unsearched.map(directory => `${directory} could not be searched for env files`),
    ...unexpected.map(name => `${name} is set; a gate run takes only the documented variables`),
  ];
}

function isolationErrors(env) {
  const errors = ['INTERDOMESTIK_TASK_OWNS_PORT', 'SKIP_DOCKER_DOCTOR']
    .filter(key => env[key] && env[key] !== '1')
    .map(key => `${key} must be 1 when set`);
  const browsers = env.PLAYWRIGHT_BROWSERS_PATH;
  if (browsers && (!browsers.startsWith('/') || [...browsers].some(isControl))) {
    errors.push('PLAYWRIGHT_BROWSERS_PATH must be an absolute path');
  }
  if (env.HOSTNAME && env.HOSTNAME !== '127.0.0.1')
    errors.push('HOSTNAME must be 127.0.0.1 when set');
  return errors;
}

/** The effective database, app and upload settings the gate steps will read. */
export function environmentErrors(marker, env, sources = {}) {
  const forbidden = marker.forbidden_ports;
  const errors = [...sourceErrors(sources), ...emptyValueErrors(env)];
  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL must be set; the default fallback is the shared database on 54322');
  }
  for (const key of checkedEnvKeys(env).filter(name => DATABASE_URL_NAME.test(name))) {
    if (env[key]) errors.push(...databaseUrlErrors(key, env[key], marker.database, forbidden));
  }
  if (!env.PW_PORT) errors.push(`PW_PORT must be set to ${marker.app_port}`);
  for (const key of ['PW_PORT', 'PORT']) {
    if (env[key]) errors.push(...appPortErrors(key, env[key], marker));
  }
  for (const key of [...HOST_ENV_KEYS, 'PLAYWRIGHT_BASE_URL']) {
    if (env[key]) errors.push(...originErrors(key, env[key], marker.app_port));
  }
  if (env.SENTRY_AUTH_TOKEN) errors.push('SENTRY_AUTH_TOKEN must be unset for gate evidence');
  errors.push(...isolationErrors(env));
  return errors;
}
