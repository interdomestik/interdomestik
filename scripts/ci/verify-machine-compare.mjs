export const DATABASE_ENV_KEYS = Object.freeze([
  'DATABASE_URL',
  'DATABASE_URL_RLS',
  'E2E_DATABASE_URL',
  'E2E_DATABASE_URL_RLS',
]);

function mismatch(field, expected, actual) {
  return expected === actual ? [] : [`${field}: marker ${expected}, this run ${actual ?? 'none'}`];
}

function digestOf(image) {
  return /@(sha256:[0-9a-f]{64})$/u.exec(image ?? '')?.[1] ?? null;
}

function databaseUrlErrors(key, raw, database, forbiddenPorts) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return [`${key} is not a URL`];
  }
  const errors = [];
  const port = Number(url.port || 5432);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) errors.push(`${key} is not postgres`);
  if (forbiddenPorts.includes(port)) errors.push(`${key} uses forbidden port ${port}`);
  const host = url.hostname.replace(/^\[(.*)\]$/u, '$1');
  if (host !== database.host) errors.push(`${key} host is not ${database.host}`);
  if (port !== database.port) errors.push(`${key} port is not ${database.port}`);
  if (url.pathname !== `/${database.name}`) errors.push(`${key} database is not ${database.name}`);
  return errors;
}

function environmentErrors(marker, env) {
  const forbidden = marker.forbidden_ports;
  const errors = [];
  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL must be set; the default fallback is the shared database on 54322');
  }
  for (const key of DATABASE_ENV_KEYS) {
    if (env[key]) errors.push(...databaseUrlErrors(key, env[key], marker.database, forbidden));
  }
  const appPort = Number(env.PW_PORT);
  if (!env.PW_PORT) errors.push(`PW_PORT must be set to ${marker.app_port}`);
  else if (forbidden.includes(appPort)) errors.push(`PW_PORT uses forbidden port ${appPort}`);
  else if (appPort !== marker.app_port) errors.push(`PW_PORT is not ${marker.app_port}`);
  if (env.PILOT_HOST && !env.PILOT_HOST.endsWith(`:${marker.app_port}`)) {
    errors.push(`PILOT_HOST does not use port ${marker.app_port}`);
  }
  if (env.SENTRY_AUTH_TOKEN) errors.push('SENTRY_AUTH_TOKEN must be unset for gate evidence');
  return errors;
}

function databaseContainerErrors(marker, database, ciPostgresDigest) {
  const name = marker.database.container;
  if (!database) return [`database container ${name} was not found`];
  const errors = [...mismatch('database.image', marker.database.image, database.image)];
  if (!database.running) errors.push(`database container ${name} is not running`);
  if (database.hostIp !== marker.database.host) {
    errors.push(`database container is not published on ${marker.database.host}`);
  }
  if (database.hostPort !== String(marker.database.port)) {
    errors.push(`database container is not published on port ${marker.database.port}`);
  }
  if (!ciPostgresDigest) errors.push('the CI postgres image digest could not be read');
  else if (digestOf(marker.database.image) !== ciPostgresDigest) {
    errors.push('database.image digest differs from the CI postgres service image');
  }
  return errors;
}

/** Every difference between the marker and the live machine, without printing the hardware id. */
export function compareMachine(marker, live) {
  const errors = [];
  if (live.hardwareUuidSha256 !== marker.machine.hardware_uuid_sha256) {
    errors.push('machine.hardware_uuid_sha256 does not match this machine');
  }
  errors.push(
    ...mismatch('machine.arch', marker.machine.arch, live.arch),
    ...mismatch('os.version', marker.os.version, live.os.version),
    ...mismatch('os.build', marker.os.build, live.os.build),
    ...mismatch('node', marker.node, live.node),
    ...mismatch('pnpm', marker.pnpm, live.pnpm),
    ...mismatch(
      'container_runtime.context',
      marker.container_runtime.context,
      live.container.context
    ),
    ...mismatch('container_runtime.engine', marker.container_runtime.engine, live.container.engine),
    ...databaseContainerErrors(marker, live.database, live.ciPostgresDigest),
    ...environmentErrors(marker, live.env)
  );
  for (const [volume, freeGib] of Object.entries(live.freeGib)) {
    if (!(freeGib >= marker.min_free_gib)) {
      errors.push(`free disk on ${volume} is ${freeGib} GiB, below ${marker.min_free_gib} GiB`);
    }
  }
  if (!live.git.clean) errors.push('the working tree is not clean');
  return errors;
}
