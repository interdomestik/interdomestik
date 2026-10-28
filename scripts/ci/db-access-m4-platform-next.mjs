import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prepareCompiledFixture } from './m4-compiled-fixture/prepare-build.mjs';
import { sealCompiledBuild } from './m4-compiled-fixture/seal-build.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchOwned, runOwned } from './db-access-m4-platform-process.mjs';
import {
  readFixed,
  writePrivate,
  remaining,
  imageSnapshot,
  packageSourceBookend,
} from './db-access-m4-platform-custody.mjs';
import { platformTools } from './db-access-m4-platform-tools.mjs';
const quote = JSON.stringify;
export function nextProfile(config) {
  const { code, cache, output, tmp, preload, readFiles, nextPort, ownerPort } = config;
  const paths = [code, cache, output, tmp, preload, ...readFiles, platformTools.node];
  if (
    paths.some(
      value =>
        typeof value !== 'string' ||
        !path.isAbsolute(value) ||
        path.normalize(value) !== value ||
        /[\r\n\0]/u.test(value)
    ) ||
    new Set([code, cache, output, tmp]).size !== 4 ||
    [cache, output, tmp].some(value => value.startsWith(code + '/')) ||
    readFiles.some(file => [cache, output, tmp].some(root => file.startsWith(root + '/')))
  )
    throw Error('Closed code/data profile required');
  for (const port of [nextPort, ownerPort])
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Owned port required');
  const readDirs = [code, path.dirname(platformTools.node)];
  const files = [
    preload,
    ...readFiles,
    '/dev/null',
    '/dev/random',
    '/dev/urandom',
    '/private/etc/localtime',
  ];
  return [
    '(version 1)',
    '(deny default)',
    '(import "system.sb")',
    '(allow file-read-metadata)',
    '(allow sysctl-read)',
    '(allow signal (target self))',
    '(allow process-info* (target self))',
    '(allow process-exec (literal ' + quote(platformTools.node) + '))',
    '(allow file-read* ' +
      readDirs.map(x => '(subpath ' + quote(x) + ')').join(' ') +
      ' ' +
      files.map(x => '(literal ' + quote(x) + ')').join(' ') +
      ')',
    '(allow file-map-executable (subpath ' +
      quote(code) +
      ') (literal ' +
      quote(platformTools.node) +
      '))',
    '(allow file-read* file-write* ' +
      [cache, output, tmp].map(x => '(subpath ' + quote(x) + ')').join(' ') +
      ')',
    '(deny file-map-executable ' +
      [cache, output, tmp].map(x => '(subpath ' + quote(x) + ')').join(' ') +
      ')',
    '(allow file-write-data (literal "/dev/null"))',
    '(allow network-inbound (local tcp "localhost:' + nextPort + '"))',
    '(allow network-outbound (remote tcp "localhost:' + ownerPort + '"))',
    '',
  ].join('\n');
}
export function builtRoot(code) {
  const value = JSON.parse(
    readFixed(path.join(code, '.next/required-server-files.json'), 2 * 1024 * 1024)
  );
  if (
    value.appDir !== code ||
    value.config?.repoRoot !== code ||
    value.config?.outputFileTracingRoot !== code ||
    value.config?.turbopack?.root !== code
  )
    throw Error('Actual fresh Next built root fields refused');
}
export function nextCommand(state, kind, port, ownerPort) {
  builtRoot(state.code);
  const preload = path.join(import.meta.dirname, 'db-access-m4-platform-preload.mjs');
  const output = state.layout['next-logs'],
    tmp = state.nextTmp;
  const readFiles = [
    state.planFile,
    state.tls.next.keyFile,
    state.tls.next.certFiles[kind],
    state.tls.next.caFile,
    state.imageDescriptor,
  ];
  const config = {
    code: state.code,
    cache: state.layout['next-cache'],
    output,
    tmp,
    preload,
    readFiles,
    nextPort: port,
    ownerPort,
  };
  const profile = nextProfile(config);
  const profileFile = writePrivate(
    state.layout['driver-evidence'],
    'next-' + kind + '-' + port + '.sb',
    profile
  );
  return {
    profile,
    config,
    cwd: state.code,
    argv: [
      platformTools.sandbox,
      '-f',
      profileFile,
      platformTools.node,
      '--disable-sigusr1',
      '--permission',
      ...[state.code, config.cache, preload, platformTools.node, tmp, output, ...readFiles].map(
        file => '--allow-fs-read=' + file
      ),
      ...[config.cache, output, tmp].map(file => '--allow-fs-write=' + file),
      '--import=' + pathToFileURL(preload).href,
      path.join(state.code, 'serve.mjs'),
    ],
    env: {
      PATH: '/usr/bin:/bin',
      HOME: state.nextHome,
      TMPDIR: tmp,
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PRIVATE_OUTPUT_TRACE_ROOT: state.code,
      M4_COMPILED_FIXTURE_PORT: String(port),
      M4_COMPILED_IMAGE_MANIFEST_SHA256: state.imagePin,
      M4_PLATFORM_IMAGE_DESCRIPTOR: state.imageDescriptor,
      M4_COMPILED_FIXTURE_PLAN_FILE: state.planFile,
      M4_COMPILED_FIXTURE_TLS_KEY_FILE: state.tls.next.keyFile,
      M4_COMPILED_FIXTURE_TLS_CERT_FILE: state.tls.next.certFiles[kind],
      M4_ASSIGNMENT_OWNER_ORIGIN: 'https://127.0.0.1:' + ownerPort,
      M4_ASSIGNMENT_OWNER_CA_FILE: state.tls.next.caFile,
      M4_ASSIGNMENT_RELAY_DEADLINE_MS: '18000',
    },
  };
}
export async function startNext(state, kind, port, ownerPort) {
  const command = nextCommand(state, kind, port, ownerPort);
  const child = launchOwned(command, state.deadlineAt);
  state.children.add(child);
  const until = performance.now() + remaining(state.deadlineAt, 15000);
  while (performance.now() < until) {
    if (child.ended()) {
      await child.wait();
      throw Error('Next exited before readiness');
    }
    const rows = child
      .output()
      .split('\n')
      .filter(line => line.startsWith('{'))
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      });
    const ready = rows.filter(row => row?.kind === 'm4-next-fixture-ready');
    if (ready.length > 1) throw Error('Duplicate Next readiness');
    if (ready.length === 1) {
      if (
        ready[0].origin !== 'https://127.0.0.1:' + port ||
        ready[0].buildId !== state.image.buildId
      )
        throw Error('Fresh Next readiness binding refused');
      return child;
    }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error('Fresh Next readiness deadline');
}

export async function buildNextImage({
  candidateRoot,
  producerRoot,
  compiledPackageRoot,
  workRoot,
  layout,
  deadlineAt,
}) {
  const targetName = 'm4-compiled-' + randomUUID();
  const args = {
    candidateRoot,
    producerRoot,
    compiledPackageRoot,
    ownedParent: workRoot,
    targetName,
  };
  const prepared = prepareCompiledFixture(args);
  const code = path.join(prepared.target, 'project');
  const command = JSON.parse(readFixed(path.join(prepared.target, 'build-command.json')));
  if (
    command.argv.length !== 4 ||
    command.argv[0] !== process.execPath ||
    command.argv[1] !== path.join(code, 'node_modules/next/dist/bin/next') ||
    command.argv[2] !== 'build' ||
    command.argv[3] !== '--webpack' ||
    command.cwd !== code
  )
    throw Error('Literal build command refused');
  await runOwned(
    {
      ...command,
      argv: [process.execPath, '--disable-sigusr1', ...command.argv.slice(1)],
    },
    deadlineAt
  );
  const seal = sealCompiledBuild(args);
  const imagePin = seal.manifestSha256;
  // The build's old cache remains owned data; runtime cache is a distinct physical path.
  const oldCache = path.join(code, '.next/cache');
  if (fs.existsSync(oldCache))
    fs.renameSync(oldCache, path.join(layout['next-cache'], 'build-predecessor'));
  fs.symlinkSync(layout['next-cache'], oldCache);
  const image = imageSnapshot(code, imagePin);
  const imageFiles = JSON.parse(readFixed(path.join(code, 'm4-build-image.json'))).files;
  const packageGraph = JSON.parse(readFixed(path.join(prepared.target, 'installed-graph.json')));
  const sourcePackages = packageSourceBookend(compiledPackageRoot, packageGraph, imageFiles);
  return { code, imagePin, image, imageFiles, packageGraph, sourcePackages };
}
