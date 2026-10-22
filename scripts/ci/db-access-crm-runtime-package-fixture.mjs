import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { hostIdentity } from './db-access-crm-runtime-graph.mjs';
import { installCrmPackages } from './db-access-crm-runtime-packages.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const integrityOf = bytes => 'sha512-' + createHash('sha512').update(bytes).digest('base64');

let host = null;
try {
  host = hostIdentity();
} catch {
  host = null;
}
const only = { skip: host ? false : 'fixed graph carries no slots for this host' };
const platform = () =>
  host.libc
    ? { os: [host.platform], cpu: [host.arch], libc: [host.libc] }
    : { os: [host.platform], cpu: [host.arch] };

const SOURCE = "module.exports = 'beta';\n";
const PATCHED = "module.exports = 'patched';\n";
const PATCH = [
  'diff --git a/index.js b/index.js',
  '--- a/index.js',
  '+++ b/index.js',
  '@@ -1 +1 @@',
  "-module.exports = 'beta';",
  "+module.exports = 'patched';",
  '',
].join('\n');
const EXTRA_TARGET = [
  'diff --git a/other.js b/other.js',
  '--- a/other.js',
  '+++ b/other.js',
  '@@ -1 +1 @@',
  '-a',
  '+b',
  '',
].join('\n');

function tarGz(entries) {
  const octal = (value, size) => value.toString(8).padStart(size - 1, '0') + '\0';
  const blocks = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    const body = Buffer.from(entry.body ?? '');
    const type = entry.type ?? '0';
    header.write(entry.name, 0, 100, 'utf8');
    header.write(octal(entry.mode ?? 0o644, 8), 100);
    header.write(octal(0, 8), 108);
    header.write(octal(0, 8), 116);
    header.write(octal(type === '0' ? body.length : 0, 12), 124);
    header.write(octal(1_700_000_000, 12), 136);
    header.write('        ', 148);
    header.write(type, 156);
    header.write(entry.link ?? '', 157, 100, 'utf8');
    header.write('ustar\0' + '00', 257);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header);
    if (type === '0') blocks.push(body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const defaultEntries = (name, version, files) => [
  { name: 'package/', type: '5', mode: 0o755 },
  { name: 'package/package.json', body: JSON.stringify({ name, version }) },
  ...Object.entries(files).map(([file, body]) => ({
    name: 'package/' + file,
    body,
    mode: file.startsWith('bin/') ? 0o755 : 0o644,
  })),
];

function build(t, change = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-packages-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, 'candidate');
  const tarballRoot = path.join(base, 'tarballs');
  const archives = path.join(tarballRoot, 'crm');
  const root = path.join(base, 'assembly', 'crm');
  fs.mkdirSync(path.join(source, 'patches'), { recursive: true });
  fs.mkdirSync(archives, { recursive: true });
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(source, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  fs.writeFileSync(path.join(source, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
  const patchFile = path.join(source, 'patches/beta@1.0.0.patch');
  fs.writeFileSync(patchFile, change.patchText ?? PATCH);
  const patchBytes = fs.readFileSync(patchFile);
  const packages = {};
  const slot = (snapshot, name, version, { files = {}, ...extra } = {}) => {
    const bytes = tarGz(change.entries?.[name] ?? defaultEntries(name, version, files));
    const integrity = integrityOf(bytes);
    fs.writeFileSync(
      path.join(archives, sha256(integrity) + '.tgz'),
      change.corrupt === name ? Buffer.concat([bytes, Buffer.from('tamper')]) : bytes
    );
    const id = sha256(snapshot);
    packages[id] = {
      snapshot,
      name,
      version,
      resolved:
        'https://registry.npmjs.org/' +
        name +
        '/-/' +
        name.split('/').at(-1) +
        '-' +
        version +
        '.tgz',
      integrity,
      dependencies: {},
      optionalDependencies: {},
      ...extra,
    };
    return id;
  };
  const gamma = slot('@scope/gamma@2.0.0', '@scope/gamma', '2.0.0');
  const alien = slot('alien@1.0.0', 'alien', '1.0.0', { os: ['aix'], cpu: ['ppc64'] });
  const native = slot('native@1.0.0', 'native', '1.0.0', platform());
  const compiler = slot(host.compiler + '@0.28.2', host.compiler, '0.28.2', {
    ...platform(),
    files: { 'bin/esbuild': 'esbuild-native-stub\n' },
  });
  const esbuild = slot('esbuild@0.28.2', 'esbuild', '0.28.2', {
    optionalDependencies: { [host.compiler]: compiler },
  });
  const peer = change.peerBeta
    ? slot('beta@1.0.0(peer)', 'beta', '1.0.0', { files: { 'index.js': SOURCE } })
    : null;
  const betaSnapshot = 'beta@1.0.0(patch_hash=' + sha256(patchBytes) + ')';
  const beta = slot(betaSnapshot, 'beta', '1.0.0', {
    files: { 'index.js': SOURCE },
    dependencies: { beta: peer ?? sha256(betaSnapshot), '@scope/gamma': gamma },
    patch: {
      file: 'patches/beta@1.0.0.patch',
      sha256: sha256(patchBytes),
      bytes: patchBytes.length,
      mode: '100644',
      lockHash: sha256(patchBytes),
      patchedFiles: change.patchedFiles ?? { 'index.js': sha256(PATCHED) },
    },
  });
  const alpha = slot('alpha@1.0.0', 'alpha', '1.0.0', {
    dependencies: { beta, ...(change.requireAlien ? { alien } : {}) },
    optionalDependencies: { native, ...(change.requireAlien ? {} : { alien }) },
  });
  const ids = { alpha, beta, gamma, alien, native, esbuild, compiler, peer };
  const lock = {
    version: change.version ?? 1,
    sourceLockSha256:
      change.sourceLockSha256 ?? sha256(fs.readFileSync(path.join(source, 'pnpm-lock.yaml'))),
    workspaceSha256: sha256(fs.readFileSync(path.join(source, 'pnpm-workspace.yaml'))),
    roots: { alpha, esbuild },
    packages,
  };
  change.mutate?.(lock, ids);
  return {
    base,
    source,
    root,
    ids,
    lock,
    install: () => installCrmPackages({ lock, sourceRoot: source, root, tarballRoot }),
  };
}

export { build, host, only, sha256, PATCH, PATCHED, EXTRA_TARGET };
