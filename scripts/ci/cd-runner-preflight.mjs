import { execFileSync } from 'node:child_process';
import { readFileSync, statfsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const GIB = 1024 ** 3;
const DISK_FLOOR = 30 * GIB;
const MEMORY_FLOOR = 8 * GIB;
const EXPECTED_RUNNER = 'interdomestik-z620-staging';
const DOCKER_COMMAND = '/usr/bin/docker';
export const EXPECTED_RUNNER_TEMP = '/home/arben/actions-runner-interdomestik-staging/_work/_temp';
export const EXPECTED_DOCKER_ROOT = '/var/lib/docker';
export const DEDICATED_PRUNE_ARGS = Object.freeze([
  'buildx',
  '--builder',
  'interdomestik-cd-staging',
  'prune',
  '--filter',
  'until=168h',
  '--force',
]);
const DEDICATED_BUILDER = 'interdomestik-cd-staging';

function runnerTempFreeBytes() {
  const stats = statfsSync(EXPECTED_RUNNER_TEMP, { bigint: true });
  return Number(stats.bavail * stats.bsize);
}

function dockerRootFreeBytes() {
  const stats = statfsSync(EXPECTED_DOCKER_ROOT, { bigint: true });
  return Number(stats.bavail * stats.bsize);
}

function availableMemoryBytes() {
  const match = readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)\s+kB$/mu);
  return match ? Number(match[1]) * 1024 : 0;
}

function dockerState() {
  try {
    const output = execFileSync(DOCKER_COMMAND, ['info', '--format', '{{json .DockerRootDir}}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    });
    return { dockerAvailable: true, dockerRoot: JSON.parse(output.trim()) };
  } catch {
    return { dockerAvailable: false, dockerRoot: '' };
  }
}

export function collectRunnerSnapshot(env = process.env) {
  const docker = dockerState();
  return {
    runnerName: env.RUNNER_NAME,
    runnerOs: env.RUNNER_OS,
    runnerArch: env.RUNNER_ARCH,
    runnerTemp: env.RUNNER_TEMP,
    runnerTempFreeBytes: env.RUNNER_TEMP === EXPECTED_RUNNER_TEMP ? runnerTempFreeBytes() : 0,
    dockerRootFreeBytes: docker.dockerRoot === EXPECTED_DOCKER_ROOT ? dockerRootFreeBytes() : 0,
    availableMemoryBytes: availableMemoryBytes(),
    ...docker,
  };
}

export function evaluateRunnerPreflight(snapshot) {
  const failures = [];
  if (snapshot.runnerName !== EXPECTED_RUNNER)
    failures.push(`exclusive runner must be ${EXPECTED_RUNNER}`);
  if (snapshot.runnerOs !== 'Linux') failures.push('runner OS must be Linux');
  if (snapshot.runnerArch !== 'X64') failures.push('runner architecture must be X64');
  if (!snapshot.dockerAvailable) failures.push('Docker must be available');
  if (snapshot.runnerTemp !== EXPECTED_RUNNER_TEMP)
    failures.push('RUNNER_TEMP must use the exclusive runner path');
  if (snapshot.dockerRoot !== EXPECTED_DOCKER_ROOT)
    failures.push('Docker data root must use the exclusive runner path');
  if (snapshot.runnerTempFreeBytes < DISK_FLOOR)
    failures.push('RUNNER_TEMP must have at least 30 GiB free');
  if (snapshot.dockerRootFreeBytes < DISK_FLOOR)
    failures.push('Docker data root must have at least 30 GiB free');
  if (snapshot.availableMemoryBytes < MEMORY_FLOOR)
    failures.push('host available memory must be at least 8 GiB');
  if (failures.length)
    throw new Error(`Z620 staging runner preflight failed: ${failures.join('; ')}`);
  const gib = value => Number((value / GIB).toFixed(1));
  return {
    status: 'ready',
    runner: snapshot.runnerName,
    runnerTempFreeGiB: gib(snapshot.runnerTempFreeBytes),
    dockerRoot: snapshot.dockerRoot,
    dockerRootFreeGiB: gib(snapshot.dockerRootFreeBytes),
    availableMemoryGiB: gib(snapshot.availableMemoryBytes),
  };
}

export function evaluateDedicatedBuilderInspection(output) {
  const hasName = /^Name:\s+interdomestik-cd-staging\s*$/mu.test(output);
  const hasDriver = /^Driver:\s+docker-container\s*$/mu.test(output);
  const isRunning = /^Status:\s+running\s*$/mu.test(output);
  if (!hasName || !hasDriver || !isRunning)
    throw new Error(
      `Z620 staging runner preflight failed: dedicated buildx builder ${DEDICATED_BUILDER} must use the running docker-container driver`
    );
  return { status: 'ready', builder: DEDICATED_BUILDER, driver: 'docker-container' };
}

export function verifyDedicatedBuilder(executor = execFileSync) {
  const output = executor(DOCKER_COMMAND, ['buildx', 'inspect', DEDICATED_BUILDER], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  return evaluateDedicatedBuilderInspection(output);
}

export function pruneDedicatedBuilder(executor = execFileSync) {
  executor(DOCKER_COMMAND, DEDICATED_PRUNE_ARGS, {
    shell: false,
    stdio: 'inherit',
    timeout: 300_000,
  });
  return { status: 'pruned', builder: DEDICATED_BUILDER, olderThan: '168h' };
}

function runMode(mode) {
  if (mode === 'preflight') return evaluateRunnerPreflight(collectRunnerSnapshot());
  if (mode === 'verify-builder') return verifyDedicatedBuilder();
  if (mode === 'prune') return pruneDedicatedBuilder();
  throw new Error(`unsupported Z620 staging runner operation: ${mode}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = runMode(process.argv[2] || 'preflight');
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error?.message || 'Z620 staging runner preflight failed');
    process.exitCode = 1;
  }
}
