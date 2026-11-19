// The Docker side of the probe: one endpoint per run, the container by its ID, and the database
// list from one fixed query. No operator-supplied value reaches a command's arguments: the
// container name is matched against Docker's own listing, and the database name is compared in
// JavaScript.

// The context's endpoint must be a local Unix socket; it is passed to every later Docker call so
// that another terminal switching the context cannot redirect the probes.
const LOCAL_SOCKET = /^unix:\/\/\/\S+$/u;

// `env -i` drops every PG* variable the container defines; the socket directory and port are the
// container's own. The PATH covers the Debian and Alpine variants of the postgres image.
const CONTAINER_PATH = 'PATH=/usr/lib/postgresql/16/bin:/usr/local/bin:/usr/bin:/bin';
export const DATABASE_LIST_QUERY =
  'SELECT array_to_json(ARRAY(SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname))';
const PSQL = ['psql', '-X', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres'];
const INSPECT_FORMAT = '{{.Config.Image}}|{{.State.Running}}|{{json .NetworkSettings.Ports}}';

function tryRun(exec, args, cwd) {
  try {
    return exec('docker', args, cwd);
  } catch {
    return null;
  }
}

/** The endpoint of the named context, or null when it is not a local Unix socket. */
export function parseLocalEndpoint(inspectOutput) {
  try {
    const endpoint = JSON.parse(inspectOutput ?? '');
    return typeof endpoint === 'string' && LOCAL_SOCKET.test(endpoint) ? endpoint : null;
  } catch {
    return null;
  }
}

/** The ID of the container whose name is exactly `name`, from `ps --format '{{.ID}}\t{{.Names}}'`. */
export function containerIdByName(listing, name) {
  for (const line of (listing ?? '').split('\n')) {
    const [id, names = ''] = line.split('\t');
    if (/^[0-9a-f]{64}$/u.test(id) && names.split(',').includes(name)) return id;
  }
  return null;
}

/** The database names from the fixed query, or null unless the output is a JSON string array. */
export function parseDatabaseNames(output) {
  try {
    const names = JSON.parse(output ?? '');
    return Array.isArray(names) && names.every(name => typeof name === 'string') ? names : null;
  } catch {
    return null;
  }
}

/** Every host publication of every container port, so no extra binding can hide behind one. */
export function parseContainer(inspectOutput) {
  if (!inspectOutput) return null;
  const [image, running, portsJson] = inspectOutput.split('|');
  let ports = null;
  try {
    ports = JSON.parse(portsJson);
  } catch {
    ports = null;
  }
  const bindings = Object.entries(ports ?? {}).flatMap(([containerPort, published]) =>
    (published ?? []).map(binding => ({
      containerPort,
      hostIp: binding?.HostIp ?? null,
      hostPort: binding?.HostPort ?? null,
    }))
  );
  return { image, running: running === 'true', bindings };
}

/**
 * `container`: the context name, whether its endpoint is a local socket, and the engine version.
 * `database`: the container (null when not found); `databaseNames`: null when unreadable.
 */
export function probeDocker(exec, containerName, cwd) {
  const context = tryRun(exec, ['context', 'show'], cwd);
  const endpoint = context
    ? parseLocalEndpoint(
        tryRun(
          exec,
          ['context', 'inspect', context, '--format', '{{json .Endpoints.docker.Host}}'],
          cwd
        )
      )
    : null;
  const result = {
    container: { context, localSocket: endpoint !== null, engine: null },
    database: null,
    databaseNames: null,
  };
  if (!endpoint) return result;
  const docker = args => tryRun(exec, ['--host', endpoint, ...args], cwd);
  result.container.engine = docker(['version', '--format', '{{.Server.Version}}']);
  const listing = docker(['ps', '-a', '--no-trunc', '--format', '{{.ID}}\t{{.Names}}']);
  const id = containerIdByName(listing, containerName);
  if (!id) return result;
  result.database = parseContainer(docker(['inspect', '--format', INSPECT_FORMAT, id]));
  if (result.database?.running) {
    const query = ['exec', id, 'env', '-i', CONTAINER_PATH, ...PSQL, '-d', 'postgres', '-tA'];
    result.databaseNames = parseDatabaseNames(docker([...query, '-c', DATABASE_LIST_QUERY]));
  }
  return result;
}
