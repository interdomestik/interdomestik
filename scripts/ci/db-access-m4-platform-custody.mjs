import fs from 'node:fs';
import path from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import { census } from './m4-compiled-fixture/project/image-custody.mjs';
import { resolveInstalledPackage } from './m4-compiled-fixture/package-graph.mjs';

export const sha = value => createHash('sha256').update(value).digest('hex');
export function fixedImageTool(state, command) {
  const spec =
    command === 'playwright'
      ? ['@playwright/test', 'cli.js']
      : command === 'next'
        ? ['next', 'dist/server/next-server.js']
        : null;
  if (!spec) throw Error('Fixed image tool identity required');
  const [name, suffix] = spec;
  const id = state.packageGraph.roots[name];
  const node = state.packageGraph.nodes.find(row => row.id === id && row.name === name);
  if (!node || !/^[a-f0-9]{20}$/u.test(id)) throw Error('Fixed image package identity required');
  const root = path.join(state.code, '.packages', id, 'node_modules', name);
  if (
    fs.realpathSync(root) !== root ||
    fs.realpathSync(path.join(state.code, 'node_modules', name)) !== root ||
    sha(readFixed(path.join(root, 'package.json'))) !== node.packageSha256
  )
    throw Error('Fixed image package binding changed');
  const file = path.join(root, suffix);
  const record = state.imageFiles[path.relative(state.code, file)];
  const bytes = readFixed(file);
  if (
    record?.kind !== 'file' ||
    bytes.length !== record.bytes ||
    sha(bytes) !== record.sha256 ||
    (fs.statSync(file).mode & 0o777) !== record.mode
  )
    throw Error('Fixed image tool bytes changed');
  return file;
}
export function ownedDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o7777) !== 0o700 ||
    fs.realpathSync(directory) !== directory
  )
    throw Error('Physical private platform directory required');
  return directory;
}
export function readFixed(file, limit = 32 * 1024 * 1024) {
  if (fs.realpathSync(file) !== file) throw Error('Physical platform file required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const a = fs.fstatSync(fd);
    if (
      !a.isFile() ||
      a.nlink !== 1 ||
      a.uid !== process.getuid() ||
      a.mode & 0o022 ||
      a.size > limit
    )
      throw Error('Platform file custody refused');
    const bytes = fs.readFileSync(fd),
      b = fs.fstatSync(fd),
      c = fs.lstatSync(file);
    if (
      bytes.length !== a.size ||
      ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode', 'nlink'].some(
        key => a[key] !== b[key] || b[key] !== c[key]
      )
    )
      throw Error('Platform file changed');
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}
export function writePrivate(directory, name, value) {
  ownedDirectory(directory);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(name)) throw Error('Private leaf name refused');
  const file = path.join(directory, name);
  const fd = fs.openSync(
    file,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
    0o600
  );
  try {
    fs.writeFileSync(fd, value);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return file;
}
export function databaseCA(value) {
  if (
    !value ||
    Object.keys(value).sort().join('|') !== 'caPem|caSha256' ||
    typeof value.caPem !== 'string' ||
    value.caPem.length > 16384 ||
    !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/u.test(
      value.caPem
    ) ||
    sha(value.caPem) !== value.caSha256
  )
    throw Error('Exact public database CA required');
  const cert = new X509Certificate(value.caPem);
  if (!cert.ca || Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) <= Date.now())
    throw Error('Current database CA required');
  return value.caPem;
}
export function imageSnapshot(code, expected) {
  const manifestBytes = readFixed(path.join(code, 'm4-build-image.json'));
  if (sha(manifestBytes) !== expected) throw Error('Fresh compiled image manifest changed');
  const image = JSON.parse(manifestBytes),
    files = census(code);
  delete files['m4-build-image.json'];
  if (JSON.stringify(files) !== JSON.stringify(image.files)) throw Error('Compiled image changed');
  for (const [relative, row] of Object.entries(files))
    if (row.kind === 'file' && fs.lstatSync(path.join(code, relative)).nlink !== 1)
      throw Error('Compiled code hardlink refused');
  return {
    manifestSha256: expected,
    filesSha256: sha(JSON.stringify(files)),
    buildId: image.buildId,
    actionMap: image.actionMap,
  };
}
const browserRoot =
  '/Volumes/Dev2TB/interdomestik/proofs/m4-compiled-browser-firefox-v1/store/firefox-1543';
export function browserSnapshot() {
  if (fs.realpathSync(browserRoot) !== browserRoot) throw Error('Physical Firefox root required');
  const rows = census(browserRoot),
    digest = sha(JSON.stringify(rows));
  const executable = path.join(browserRoot, 'firefox/Nightly.app/Contents/MacOS/firefox');
  if (
    Object.keys(rows).length !== 80 ||
    digest !== '4978c339471c54b67f4e400700d9aeb63b5061b124b4ce16a8039067f82cca96' ||
    sha(readFixed(executable)) !==
      'e75d92f6f3210c9c31056d10b912f43c139f0cf7a2a3d0f2e002e88c1c7fbf5a'
  )
    throw Error('Fixed Firefox1543 image refused');
  return { root: browserRoot, executable, digest, records: 80 };
}
export function remaining(deadlineAt, maximum = 300000) {
  const value = Math.floor(deadlineAt - performance.now());
  if (!Number.isFinite(value) || value < 1 || value > 300000) throw Error('Platform deadline');
  return Math.min(maximum, value);
}
export function packageSourceBookend(packageRoot, graph, files) {
  const installed = fs.realpathSync(path.join(packageRoot, 'node_modules'));
  const records = {},
    byId = new Map(graph.nodes.map(node => [node.id, node]));
  for (const node of graph.nodes) {
    if (fs.realpathSync(node.source) !== node.source || !node.source.startsWith(installed + '/'))
      throw Error('Physical owned compiler package source');
    const prefix = '.packages/' + node.id + '/node_modules/' + node.name + '/';
    const found = [];
    function inventory(dir) {
      for (const name of fs.readdirSync(dir).sort()) {
        if (dir === node.source && name === 'node_modules') continue;
        const file = path.join(dir, name),
          stat = fs.lstatSync(file);
        if (stat.isDirectory() && !stat.isSymbolicLink()) inventory(file);
        else found.push(path.relative(node.source, file));
      }
    }
    inventory(node.source);
    const expected = Object.keys(files)
      .filter(name => name.startsWith(prefix))
      .map(name => name.slice(prefix.length))
      .filter(name => !name.startsWith('node_modules/'));
    if (JSON.stringify(found.sort()) !== JSON.stringify(expected.sort()))
      throw Error('Compiler source membership changed');
    for (const [relative, record] of Object.entries(files)) {
      if (!relative.startsWith(prefix)) continue;
      const suffix = relative.slice(prefix.length);
      if (suffix.startsWith('node_modules/')) continue;
      const file = path.join(node.source, suffix),
        stat = fs.lstatSync(file);
      if (record.kind === 'link') {
        if (
          !stat.isSymbolicLink() ||
          fs.readlinkSync(file) !== record.target ||
          !fs.realpathSync(file).startsWith(node.source + '/')
        )
          throw Error('Package source link changed');
      } else if (
        !stat.isFile() ||
        sha(readFixed(file)) !== record.sha256 ||
        stat.size !== record.bytes ||
        (stat.mode & 0o777) !== record.mode
      )
        throw Error('Package source bytes changed');
      records[relative] = record;
    }
    const manifest = JSON.parse(readFixed(path.join(node.source, 'package.json')));
    if (sha(readFixed(path.join(node.source, 'package.json'))) !== node.packageSha256)
      throw Error('Package source manifest changed');
    const names = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]);
    for (const name of names) {
      let resolved;
      try {
        resolved = resolveInstalledPackage(node.source, name, installed);
      } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') throw error;
      }
      if (resolved !== byId.get(node.dependencies[name])?.source)
        throw Error('Original compiler dependency edge changed');
    }
  }
  return {
    records: Object.keys(records).length,
    digest: sha(JSON.stringify(records)),
    packages: graph.nodes.length,
  };
}
