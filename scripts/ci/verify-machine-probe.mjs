import { execFileSync } from 'node:child_process';
import { readFileSync, statfsSync } from 'node:fs';
import path from 'node:path';

import { DATABASE_ENV_KEYS } from './verify-machine-compare.mjs';
import { sha256Hex } from './verify-machine-marker.mjs';

const ENV_KEYS = Object.freeze([
  ...DATABASE_ENV_KEYS,
  'PW_PORT',
  'PILOT_HOST',
  'SENTRY_AUTH_TOKEN',
]);
const GIB = 1024 ** 3;

export function runCommand(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  }).trim();
}

function tryRun(exec, command, args, cwd) {
  try {
    return exec(command, args, cwd);
  } catch {
    return null;
  }
}

export function parsePlatformUuid(ioregOutput) {
  return /"IOPlatformUUID"\s*=\s*"([^"]+)"/u.exec(ioregOutput ?? '')?.[1] ?? null;
}

export function parseContainer(inspectOutput) {
  if (!inspectOutput) return null;
  const [image, running, portsJson] = inspectOutput.split('|');
  let binding = null;
  try {
    binding = JSON.parse(portsJson)?.['5432/tcp']?.[0] ?? null;
  } catch {
    binding = null;
  }
  return {
    image,
    running: running === 'true',
    hostIp: binding?.HostIp ?? null,
    hostPort: binding?.HostPort ?? null,
  };
}

export function readCiPostgresDigest(repoRoot, read = readFileSync) {
  try {
    const workflow = read(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    return /image:\s*\S*postgres:16@(sha256:[0-9a-f]{64})/u.exec(workflow)?.[1] ?? null;
  } catch {
    return null;
  }
}

function freeGib(statfs, target) {
  const stats = statfs(target);
  return Math.floor((Number(stats.bavail) * Number(stats.bsize) * 10) / GIB) / 10;
}

export function gitState(repoRoot, exec = runCommand) {
  const head = exec('git', ['rev-parse', 'HEAD'], repoRoot);
  const tracked = exec('git', ['status', '--porcelain=v1', '--untracked-files=no'], repoRoot);
  const all = exec('git', ['status', '--porcelain=v1', '--untracked-files=all'], repoRoot);
  return { head, trackedClean: tracked === '', clean: all === '' };
}

/** Collects the live configuration that the marker records. Only hashes leave the machine id. */
export function probeMachine({ repoRoot, marker, env, exec = runCommand, statfs = statfsSync }) {
  const uuid = parsePlatformUuid(
    tryRun(exec, 'ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], repoRoot)
  );
  const inspect = tryRun(
    exec,
    'docker',
    [
      'inspect',
      '--format',
      '{{.Config.Image}}|{{.State.Running}}|{{json .NetworkSettings.Ports}}',
      marker.database.container,
    ],
    repoRoot
  );
  return {
    hardwareUuidSha256: uuid ? sha256Hex(uuid) : null,
    arch: process.arch,
    os: {
      version: tryRun(exec, 'sw_vers', ['-productVersion'], repoRoot),
      build: tryRun(exec, 'sw_vers', ['-buildVersion'], repoRoot),
    },
    node: process.version,
    pnpm: tryRun(exec, 'pnpm', ['--version'], repoRoot),
    container: {
      context: tryRun(exec, 'docker', ['context', 'show'], repoRoot),
      engine: tryRun(exec, 'docker', ['version', '--format', '{{.Server.Version}}'], repoRoot),
    },
    database: parseContainer(inspect),
    ciPostgresDigest: readCiPostgresDigest(repoRoot),
    env: Object.fromEntries(ENV_KEYS.map(key => [key, env[key] ?? ''])),
    freeGib: { repository: freeGib(statfs, repoRoot), system: freeGib(statfs, '/') },
    git: gitState(repoRoot, exec),
  };
}
