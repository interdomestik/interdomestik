import { execFileSync } from 'node:child_process';
import { readFileSync, statfsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const GIB = 1024 ** 3;
const DISK_FLOOR = 30 * GIB;
const MEMORY_FLOOR = 8 * GIB;
const EXPECTED_RUNNER = 'interdomestik-z620-staging';
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

function freeBytes(target) {
  if (!target) return 0;
  const stats = statfsSync(target, { bigint: true });
  return Number(stats.bavail * stats.bsize);
}

function availableMemoryBytes() {
  const match = readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)\s+kB$/mu);
  return match ? Number(match[1]) * 1024 : 0;
}

function dockerState() {
  try {
    const output = execFileSync('docker', ['info', '--format', '{{json .DockerRootDir}}'], {
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
    runnerTempFreeBytes: freeBytes(env.RUNNER_TEMP),
    dockerRootFreeBytes: freeBytes(docker.dockerRoot),
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
  const output = executor('docker', ['buildx', 'inspect', DEDICATED_BUILDER], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  return evaluateDedicatedBuilderInspection(output);
}

export function pruneDedicatedBuilder(executor = execFileSync) {
  executor('docker', DEDICATED_PRUNE_ARGS, {
    shell: false,
    stdio: 'inherit',
    timeout: 300_000,
  });
  return { status: 'pruned', builder: DEDICATED_BUILDER, olderThan: '168h' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const mode = process.argv[2] || 'preflight';
    const result =
      mode === 'preflight'
        ? evaluateRunnerPreflight(collectRunnerSnapshot())
        : mode === 'verify-builder'
          ? verifyDedicatedBuilder()
          : mode === 'prune'
            ? pruneDedicatedBuilder()
            : (() => {
                throw new Error(`unsupported Z620 staging runner operation: ${mode}`);
              })();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error?.message || 'Z620 staging runner preflight failed');
    process.exitCode = 1;
  }
}
