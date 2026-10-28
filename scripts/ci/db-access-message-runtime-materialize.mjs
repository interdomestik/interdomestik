import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { exact } from './db-access-provider-runtime-identity.mjs';
import { MESSAGE_TSX_LOADER, assertMessageContract } from './db-access-message-proof-registry.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => {
  throw new Error('message runtime materialization refused: ' + reason);
};
export function supportedPackage(record, platform = process.platform, arch = process.arch) {
  const accepts = (values, value) =>
    !values ||
    (!values.includes('!' + value) &&
      (values.every(v => v.startsWith('!')) || values.includes(value)));
  return accepts(record.os, platform) && accepts(record.cpu, arch) && accepts(record.libc, 'glibc');
}

// The reply fixture names root node_modules/tsx/dist/loader.mjs literally, so the root importer
// of the authenticated source lock must pin the producer lock's tsx. Layout drift refuses.
export function sourceRootTsxVersion(text) {
  const start = text.search(/^ {2}\.:$/mu);
  if (start < 0) return undefined;
  const rest = text.slice(start + 1);
  const end = rest.search(/^(?:\S| {2}\S)/mu);
  const block = end < 0 ? rest : rest.slice(0, end);
  return block.match(/^ {6}tsx:\n {8}specifier: [^\n]+\n {8}version: ([^\s(]+)$/mu)?.[1];
}

// Archives are immutable fixed-producer inputs. Never run npm/pnpm hooks or use host node_modules.
export function materializeMessageRuntime({
  sourceRoot,
  producerRoot,
  outputRoot,
  tarballRoot,
  policy,
}) {
  const contract = policy.messageProof;
  if (!contract) return undefined;
  assertMessageContract(contract, fail);
  if (!['darwin:arm64', 'linux:x64', 'linux:arm64'].includes(process.platform + ':' + process.arch))
    fail('unsupported platform');
  const lockFile = 'scripts/ci/db-access-message-runtime-lock.json';
  const lock = JSON.parse(exact(producerRoot, lockFile, policy.producerFiles[lockFile]));
  if (lock.lockfileVersion !== 3) fail('lock version');
  const root = path.join(outputRoot, 'messages');
  fs.mkdirSync(root);
  const env = { PATH: '/usr/bin:/bin', HOME: path.join(outputRoot, 'home'), TZ: 'UTC', LANG: 'C' };
  const run = (binary, args, cwd = root) =>
    execFileSync(binary, args, {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 64 * 1024 * 1024,
    });
  const packages = {};
  for (const [location, record] of Object.entries(lock.packages)) {
    if (!location || !supportedPackage(record)) continue;
    if (
      !/^node_modules\/(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+(?:\/node_modules\/(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)*$/u.test(
        location
      ) ||
      !record.resolved?.startsWith('https://registry.npmjs.org/') ||
      !record.integrity?.startsWith('sha512-')
    )
      fail('package identity');
    const archive = path.join(tarballRoot, 'messages', hash(location) + '.tgz');
    const bytes = fs.readFileSync(archive);
    if (
      bytes.length > 150000000 ||
      'sha512-' + createHash('sha512').update(bytes).digest('base64') !== record.integrity
    )
      fail('archive integrity ' + location);
    const names = run('/usr/bin/tar', ['-tzf', archive]).split('\n').filter(Boolean);
    const kinds = run('/usr/bin/tar', ['-tvzf', archive]).split('\n').filter(Boolean);
    if (
      !names.length ||
      !['package', location.split('/').at(-1)].includes(names[0].split('/')[0]) ||
      names.some(
        n =>
          !n.startsWith(names[0].split('/')[0] + '/') ||
          n.split('/').includes('..') ||
          n.includes('\\')
      ) ||
      kinds.some(line => !/^[d-]/u.test(line))
    )
      fail('archive members ' + location);
    const target = path.join(root, location);
    fs.mkdirSync(target, { recursive: true });
    run('/usr/bin/tar', [
      '-xzf',
      archive,
      '-C',
      target,
      '--strip-components=1',
      '--no-same-owner',
      '--no-same-permissions',
    ]);
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'package.json')));
    const expectedName = location.split('node_modules/').at(-1);
    if (manifest.name !== expectedName || manifest.version !== record.version)
      fail('package manifest ' + location);
    packages[location] = {
      version: record.version,
      integrity: record.integrity,
      sha256: hash(bytes),
    };
  }
  const copied = {};
  for (const [file, expected] of Object.entries({
    ...contract.files,
    ...contract.configuration,
    ...contract.migrations,
  })) {
    const bytes = exact(sourceRoot, file, expected);
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    copied[file] = hash(bytes);
  }
  // Same pinned full tsx (CJS and ESM hooks) on both sides; never a host or resolver lookup.
  const tsx = packages['node_modules/tsx'];
  const sourceLock = exact(sourceRoot, 'pnpm-lock.yaml', contract.configuration['pnpm-lock.yaml']);
  const loader = fs.lstatSync(path.join(root, MESSAGE_TSX_LOADER), { throwIfNoEntry: false });
  if (!tsx || sourceRootTsxVersion(String(sourceLock)) !== tsx.version || !loader?.isFile())
    fail('pinned tsx loader');
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  const scope = path.join(root, 'node_modules/@interdomestik');
  fs.mkdirSync(scope, { recursive: true });
  for (const name of ['database', 'shared-auth', 'domain-communications'])
    fs.symlinkSync('../../packages/' + name, path.join(scope, name), 'dir');
  const patch = exact(
    sourceRoot,
    'patches/postgres@3.4.9.patch',
    policy.resolverFiles['patches/postgres@3.4.9.patch']
  );
  const patchFile = path.join(root, 'postgres.patch');
  fs.writeFileSync(patchFile, patch);
  run(
    '/usr/bin/patch',
    ['-p1', '-t', '-N', '-i', patchFile],
    path.join(root, 'node_modules/postgres')
  );
  for (const [name, expected] of Object.entries({
    'src/connection.js': '12f2e1a77a0ea9c2fb01fcdc8cf46469c5569a0822f1c7e60b658c20a2d1ba33',
    'cjs/src/connection.js': '143db23d9edf228a46ca23345b2faf0f47f14f2ab2eb460244c8b69a23d86c94',
  }))
    if (hash(fs.readFileSync(path.join(root, 'node_modules/postgres', name))) !== expected)
      fail('driver patch');
  for (const name of [
    'db-access-message-runtime-driver.mjs',
    'db-access-message-runtime-result.mjs',
    'db-access-message-proof-registry.mjs',
  ]) {
    const file = 'scripts/ci/' + name;
    fs.writeFileSync(path.join(root, name), exact(producerRoot, file, policy.producerFiles[file]));
  }
  return { root, packages, copied, lockSha256: hash(JSON.stringify(lock)) };
}
