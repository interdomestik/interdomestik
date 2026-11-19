// Prints a proposed marker for the owner to review and install with sudo. It never writes the
// marker itself: only a root-owned file at MARKER_PATH counts.
import {
  MARKER_PATH,
  MARKER_SCHEMA,
  PLAIN_CONTAINER_NAME,
  PLAIN_DATABASE_NAME,
  validateMarker,
} from './verify-machine-marker.mjs';

const DEFAULTS = Object.freeze({
  container: 'ida-mac-verify-pg',
  'db-host': '127.0.0.1',
  'db-port': '55438',
  'db-name': 'interdomestik_test',
  'app-port': '3310',
  'min-free-gib': '20',
});

// The shape of each option's value, checked before anything is probed or printed.
const OPTION_SHAPES = Object.freeze({
  container: PLAIN_CONTAINER_NAME,
  'db-host': /^[a-z0-9.-]+$/u,
  'db-port': /^\d{1,5}$/u,
  'db-name': PLAIN_DATABASE_NAME,
  'app-port': /^\d{1,5}$/u,
  'min-free-gib': /^\d{1,4}(?:\.\d)?$/u,
});

export function parseDescribeOptions(argv) {
  const options = { ...DEFAULTS };
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/u.exec(argument);
    if (!match || !Object.hasOwn(DEFAULTS, match[1])) return null;
    options[match[1]] = match[2];
  }
  return Object.entries(OPTION_SHAPES).every(([key, shape]) => shape.test(options[key]))
    ? options
    : null;
}

export function describeMachine(argv, deps) {
  const options = parseDescribeOptions(argv);
  if (!options) {
    deps.error(`[verify-machine] describe options: ${Object.keys(DEFAULTS).join(', ')}`);
    return 1;
  }
  const repoRoot = deps.exec('git', ['rev-parse', '--show-toplevel'], deps.cwd);
  const database = {
    image: '',
    container: options.container,
    host: options['db-host'],
    port: Number(options['db-port']),
    name: options['db-name'],
  };
  const live = deps.probe({ repoRoot, marker: { database }, env: {}, exec: deps.exec });
  const marker = {
    schema: MARKER_SCHEMA,
    created_at: deps.now(),
    machine: { hardware_uuid_sha256: live.hardwareUuidSha256, arch: live.arch },
    os: live.os,
    node: live.node,
    pnpm: live.pnpm,
    container_runtime: { context: live.container.context, engine: live.container.engine },
    database: { ...database, image: live.database?.image ?? '' },
    app_port: Number(options['app-port']),
    forbidden_ports: [3000, 54322],
    min_free_gib: Number(options['min-free-gib']),
  };
  const errors = validateMarker(marker);
  if (live.database && !live.database.running) errors.push(`${options.container} is not running`);
  if (live.database?.running && live.databaseName !== database.name) {
    errors.push(`database ${database.name} is not reachable in ${options.container}`);
  }
  if (errors.length > 0) {
    for (const line of ['cannot describe this machine:', ...errors]) {
      deps.error(`[verify-machine] ${line}`);
    }
    return 1;
  }
  deps.log(JSON.stringify(marker, null, 2));
  deps.error(`[verify-machine] review it, then install it as root at ${MARKER_PATH}`);
  return 0;
}
