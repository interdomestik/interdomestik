import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { freezeOutput, outputShape } from './db-access-output-binding.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { M4_WORKER_LOADER_PRELOAD_SOURCE } from './db-access-m4-worker-loader-preload.mjs';

const images = new WeakMap();
const fail = reason => {
  throw new Error('incomplete: M4 worker loader image ' + reason);
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const scriptRoot = fs.realpathSync(import.meta.dirname);
const executingRoot = fs.realpathSync(path.resolve(scriptRoot, '../..'));

function privatePath(root, relative, finalKind) {
  if (
    relative.startsWith('/') ||
    relative.split('/').some(part => !part || ['.', '..'].includes(part) || part.includes('\\'))
  )
    fail('image path ' + relative);
  let current = root;
  const rootStat = fs.lstatSync(root);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    rootStat.uid !== process.getuid?.() ||
    rootStat.mode & 0o022
  )
    fail('unowned/aliased image root');
  for (const [index, part] of relative.split('/').entries()) {
    const matches = fs
      .readdirSync(current)
      .filter(name => name.normalize('NFC').toLowerCase() === part.normalize('NFC').toLowerCase());
    if (matches.length !== 1 || matches[0] !== part) fail('ambiguous image path ' + relative);
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || stat.uid !== rootStat.uid || stat.mode & 0o022)
      fail('unowned/aliased image path ' + relative);
    const final = index === relative.split('/').length - 1;
    if ((!final || finalKind === 'directory') && !stat.isDirectory())
      fail('non-directory image path ' + relative);
  }
  return current;
}

function exactFile(root, relative, expected, executable) {
  const file = privatePath(root, relative, 'file');
  const stat = fs.lstatSync(file);
  const bytes = fs.readFileSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    fs.realpathSync(file) !== file ||
    bytes.length !== expected.bytes ||
    sha(bytes) !== expected.sha256 ||
    (stat.mode & 0o111 ? '100755' : '100644') !== expected.mode ||
    Boolean(stat.mode & 0o111) !== executable
  )
    fail('file descriptor ' + relative);
  return bytes;
}

function regularFiles(root) {
  const files = [];
  const visit = directory => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.mode & 0o022)
        fail('dependency ownership/alias ' + absolute);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile() && stat.nlink === 1)
        files.push(path.relative(root, absolute).split(path.sep).join('/'));
      else fail('dependency non-private file ' + absolute);
    }
  };
  visit(root);
  return files;
}

function exactDependencyFile(root, relative, expected) {
  const file = privatePath(root, relative, 'file');
  const stat = fs.lstatSync(file);
  const bytes = fs.readFileSync(file);
  const mode = stat.mode & 0o111 ? '100755' : '100644';
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    fs.realpathSync(file) !== file ||
    bytes.length !== expected.bytes ||
    sha(bytes) !== expected.sha256 ||
    mode !== expected.mode
  )
    fail('dependency descriptor ' + relative);
  return bytes;
}

function authenticateDependency(root, dependency) {
  const packageRoot = path.join(root, 'node_modules', dependency.name);
  privatePath(root, `node_modules/${dependency.name}`, 'directory');
  if (fs.realpathSync(packageRoot) !== packageRoot) fail('ambient dependency alias');
  const actual = regularFiles(packageRoot);
  const expected = Object.keys(dependency.files).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('dependency file set');
  const records = {};
  for (const relative of expected) {
    const descriptor = dependency.files[relative];
    const bytes = exactDependencyFile(packageRoot, relative, descriptor);
    records[`node_modules/${dependency.name}/${relative}`] = {
      sha256: sha(bytes),
      bytes: bytes.length,
      resolveFormat: relative.endsWith('.js') ? null : 'module',
      loadFormat: relative.endsWith('.js') ? 'commonjs' : 'module',
    };
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (packageJson.name !== dependency.name || packageJson.version !== dependency.version)
    fail('dependency package identity');
  return records;
}

function nodeIdentity(contract) {
  const executable = fs.realpathSync(process.execPath);
  const digest = sha(fs.readFileSync(executable));
  const match = contract.nodeRuntimes.find(
    value =>
      value.version === process.version &&
      value.platform === process.platform &&
      value.arch === process.arch &&
      value.executableSha256 === digest
  );
  if (!match) fail('unqualified Node runtime');
  return { ...match, executable };
}

function readCurrent(producerRoot, event) {
  const root = fs.realpathSync(producerRoot);
  if (root !== executingRoot || path.resolve(producerRoot) !== root)
    fail('producer is not the executing physical image');
  const contractDescriptor =
    PROVIDER_UNIT_POLICY.producerFiles['scripts/ci/db-access-m4-worker-loader-contract.json'];
  if (!contractDescriptor) fail('contract/policy binding');
  const contractBytes = exactFile(
    root,
    'scripts/ci/db-access-m4-worker-loader-contract.json',
    contractDescriptor,
    false
  );
  const contract = JSON.parse(contractBytes);
  if (
    contract.version !== 1 ||
    contract.contractSha256 !== undefined ||
    contract.hostedLinuxQualified !== false
  )
    fail('contract schema');
  const lockDescriptor = PROVIDER_UNIT_POLICY.resolverFiles[contract.dependency.lockfile.path];
  if (
    !lockDescriptor ||
    lockDescriptor.sha256 !== contract.dependency.lockfile.sha256 ||
    sha(exactFile(root, contract.dependency.lockfile.path, lockDescriptor, false)) !==
      contract.dependency.lockfile.sha256
  )
    fail('dependency lock binding');
  const dependency = authenticateDependency(root, contract.dependency);
  const roles = {};
  for (const [name, role] of Object.entries(contract.roles)) {
    if (!['prior', 'graph'].includes(name) || role.role !== name) fail('role schema');
    const files = {};
    for (const relative of role.producerFiles) {
      const descriptor = PROVIDER_UNIT_POLICY.producerFiles[relative];
      const bytes = exactFile(root, relative, descriptor ?? {}, false);
      files[relative] = {
        sha256: sha(bytes),
        bytes: bytes.length,
        resolveFormat: 'module',
        loadFormat: 'module',
      };
    }
    for (const relative of role.vendorFiles) {
      if (!dependency[relative]) fail('unknown role dependency path');
      files[relative] = dependency[relative];
    }
    if (!Object.hasOwn(files, role.entry)) fail('entry outside role closure');
    roles[name] = {
      ...role,
      files,
      requiredFiles: Object.keys(files).sort(),
    };
  }
  const policyDigest = sha(Buffer.from(JSON.stringify(PROVIDER_UNIT_POLICY)));
  const contractDigest = sha(contractBytes);
  const preloadDigest = sha(Buffer.from(M4_WORKER_LOADER_PRELOAD_SOURCE));
  const eventDigest = outputShape(event).digest;
  const node = nodeIdentity(contract);
  const imageDigest = sha(
    Buffer.from(
      JSON.stringify({
        root,
        policyDigest,
        contractDigest,
        preloadDigest,
        node,
        roles: Object.fromEntries(Object.entries(roles).map(([name, role]) => [name, role.files])),
        dependency,
      })
    )
  );
  return freezeOutput({
    root,
    eventDigest,
    policyDigest,
    contractDigest,
    preloadDigest,
    imageDigest,
    node,
    roles,
    hostedLinuxQualified: contract.hostedLinuxQualified,
  });
}

export function openM4WorkerLoaderImage(producerRoot, event) {
  const current = readCurrent(producerRoot, event);
  const handle = Object.freeze({ version: 1 });
  images.set(handle, current);
  return handle;
}

export function assertM4WorkerLoaderImage(handle, producerRoot, event) {
  const expected = images.get(handle);
  if (!expected) fail('foreign image handle');
  const current = readCurrent(producerRoot, event);
  if (outputShape(current).digest !== outputShape(expected).digest) fail('image changed');
  return expected;
}

export function inspectOwnedM4WorkerLoaderImage(handle) {
  const image = images.get(handle);
  if (!image) fail('foreign image handle');
  return image;
}
