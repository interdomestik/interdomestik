import { readdirSync, readFileSync, statfsSync } from 'node:fs';
import path from 'node:path';

import { checkedEnvKeys } from './verify-machine-env.mjs';
import { unexpectedEnvNames } from './verify-machine-env-names.mjs';
import { localEnvFiles } from './verify-machine-env-files.mjs';
import { runCommand } from './verify-machine-exec.mjs';
import { sha256Hex } from './verify-machine-marker.mjs';

export { childTraceEnabled, runCommand } from './verify-machine-exec.mjs';

const GIB = 1024 ** 3;

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

// `git status` never reports an edit to an assume-unchanged (lowercase tag) or skip-worktree (S)
// entry, and git can set the first bit by itself under core.ignoreStat.
const HIDDEN_FROM_STATUS = /^(?:[a-z]|S) /u;

// A lost executable bit is a change even where the checkout sets core.fileMode=false.
const STATUS = ['-c', 'core.fileMode=true', 'status', '--porcelain=v1'];

export function gitState(repoRoot, exec = runCommand) {
  const head = exec('git', ['rev-parse', 'HEAD'], repoRoot);
  const tracked = exec('git', [...STATUS, '--untracked-files=no'], repoRoot);
  const all = exec('git', [...STATUS, '--untracked-files=all'], repoRoot);
  const hiddenFromStatus = exec('git', ['ls-files', '-v', '-z'], repoRoot)
    .split('\0')
    .filter(entry => HIDDEN_FROM_STATUS.test(entry)).length;
  return { head, trackedClean: tracked === '', clean: all === '', hiddenFromStatus };
}

/** Collects the live configuration that the marker records. Only hashes leave the machine id. */
export function probeMachine({
  repoRoot,
  marker,
  env,
  exec = runCommand,
  statfs = statfsSync,
  readdir = readdirSync,
}) {
  const envFiles = localEnvFiles(repoRoot, readdir);
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
    // Absent keys stay absent: an empty value is a setting of its own.
    env: Object.fromEntries(
      checkedEnvKeys(env)
        .filter(key => env[key] !== undefined)
        .map(key => [key, env[key]])
    ),
    sources: {
      localFiles: envFiles.files,
      unsearched: envFiles.unsearched,
      unexpected: unexpectedEnvNames(env),
    },
    freeGib: { repository: freeGib(statfs, repoRoot), system: freeGib(statfs, '/') },
    git: gitState(repoRoot, exec),
  };
}
