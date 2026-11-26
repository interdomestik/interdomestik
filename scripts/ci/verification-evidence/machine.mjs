import { accessSync, constants, realpathSync, statfsSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { probeDocker } from '../verify-machine-docker.mjs';
import { MACHINE_ROLES, machineRole, sha256Hex } from '../verify-machine-marker.mjs';
import { parsePlatformUuid, readCiPostgresDigest } from '../verify-machine-probe.mjs';
import { readTrustedMarker } from '../verify-machine-trust.mjs';
import { cleanHostEnv, hostCommand } from './host.mjs';
import { assertEvidence, checkGitInputs, isSha256, same } from './ticket.mjs';

function resolveTool(command, toolPath) {
  for (const directory of toolPath.split(':')) {
    const file = path.join(directory, command);
    try {
      accessSync(file, constants.X_OK);
      return realpathSync(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('missing-tool');
}

function appPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(port, '127.0.0.1', () => socket.close(resolve));
  });
}

function databasePortReady(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port, timeout: 3000 });
    socket.once('error', reject);
    socket.once('timeout', () => socket.destroy(new Error('database-readiness')));
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
  });
}

export function checkDocker(root, marker, exec, readDigest = readCiPostgresDigest) {
  const docker = probeDocker(exec, marker.database.container, root, { evidence: true });
  const expected = marker.container_runtime;
  const enrolled = marker.database;
  const ciDigest = readDigest(root);
  const evidence = docker.evidence;
  assertEvidence(
    docker.container.context === expected.context && docker.container.engine === expected.engine &&
      evidence?.endpoint === expected.socket && isSha256(evidence?.id) &&
      /^sha256:[0-9a-f]{64}$/u.test(evidence.imageId ?? ''),
    'container-runtime'
  );
  assertEvidence(
    ciDigest && enrolled.image.endsWith(`@${ciDigest}`) &&
      evidence.imageDigests?.some(digest => digest.endsWith(`@${ciDigest}`)) &&
      docker.database.image === enrolled.image && evidence.ready &&
      docker.databaseNames?.includes(enrolled.name),
    'database-readiness'
  );
  assertEvidence(same(docker.database.bindings, [{
    containerPort: '5432/tcp',
    hostIp: enrolled.host,
    hostPort: String(enrolled.port),
  }]), 'database-bindings');
  return { context: expected.context, engine: expected.engine, socket: expected.socket,
    id: evidence.id, imageId: evidence.imageId, image: enrolled.image, ready: evidence.ready,
    databasePort: enrolled.port, databaseHost: enrolled.host };
}

export async function probeSlot(root, ticket, approved, phase) {
  const result = readTrustedMarker();
  assertEvidence(
    process.platform === 'darwin' && result.status === 'trusted' &&
      result.sha256 === approved.m5MarkerSha256 && machineRole(result.marker) === MACHINE_ROLES.m5,
    'm5-marker'
  );
  const { marker } = result;
  const account = os.userInfo();
  const env = { ...cleanHostEnv, PATH: marker.tool_path, HOME: account.homedir };
  // These commands use the trusted host account's configuration. PR code runs under the worker.
  const exec = (command, args, cwd) =>
    hostCommand(resolveTool(command, marker.tool_path), args, { cwd, env }).toString().trim();
  const uuid = parsePlatformUuid(exec('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], root));
  const machine = { hardware_uuid_sha256: uuid ? sha256Hex(uuid) : null, arch: process.arch };
  const osBuild = {
    version: exec('sw_vers', ['-productVersion'], root), build: exec('sw_vers', ['-buildVersion'], root),
  };
  assertEvidence(same(machine, marker.machine) && same(osBuild, marker.os), 'm5-machine');
  const executables = Object.fromEntries(['node', 'pnpm', 'bash'].map(
    name => [name, resolveTool(name, marker.tool_path)]
  ));
  const node = exec('node', ['--version'], root);
  // pnpm can select a package manager from its cwd. Only the worker enters the candidate with it.
  const pnpm = exec('pnpm', ['--version'], '/');
  const bash = exec('bash', ['--noprofile', '--norc', '-c', 'printf "%s" "$BASH_VERSION"'], root);
  assertEvidence(realpathSync(process.execPath) === executables.node && process.version === node &&
    same(executables, marker.executables) && node === marker.node &&
    pnpm === marker.pnpm && bash === marker.bash_version, 'm5-tools');
  const container = checkDocker(root, marker, exec);
  await Promise.all([databasePortReady(marker.database.port), appPortAvailable(marker.app_port)]);
  for (const directory of [root, '/']) {
    const { bsize, bavail } = statfsSync(directory);
    assertEvidence(bsize * bavail >= marker.min_free_gib * 1024 ** 3, 'm5-disk');
  }
  const git = checkGitInputs(root, ticket.identity, phase === 'start');
  assertEvidence(git.lockfileSha256 === ticket.lockfileSha256, 'lockfile-ticket');
  return { markerSha256: result.sha256, slot: marker.slot, git, machine, os: osBuild,
    toolPath: marker.tool_path, executables, node, pnpm, bash, container, appPort: marker.app_port };
}
