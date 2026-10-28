import fs from 'node:fs';
import path from 'node:path';
import { exact, hash, refuse } from './db-access-provider-runtime-identity.mjs';

const fail = reason => refuse('crm package graph: ' + reason);

const ID = /^[a-f0-9]{64}$/u;
const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)*$/u;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/u;
const PATCH_FILE = /^patches\/[^\\/]+\.patch$/u;
const PATCH_MARKER = /^[^(]+\(patch_hash=([a-f0-9]{64})\)/u;
const REGISTRY = 'https://registry.npmjs.org/';
const MAX_SLOTS = 5000;
const MAX_PATCH_BYTES = 4_000_000;

// Exactly the hosts the fixed graph carries native slots for.
export const HOSTS = Object.freeze({
  'darwin:arm64': Object.freeze({ libc: null, compiler: '@esbuild/darwin-arm64' }),
  'linux:x64': Object.freeze({ libc: 'glibc', compiler: '@esbuild/linux-x64' }),
  'linux:arm64': Object.freeze({ libc: 'glibc', compiler: '@esbuild/linux-arm64' }),
});

export const label = record => record.name + '@' + record.version;
const byKey = (a, b) => (a[0] < b[0] ? -1 : 1);
const sorted = map => Object.entries(map).sort(byKey);

export function hostIdentity(platform = process.platform, arch = process.arch) {
  const key = platform + ':' + arch;
  if (!Object.hasOwn(HOSTS, key)) fail('unsupported host ' + key);
  return { key, platform, arch, ...HOSTS[key] };
}

// pnpm os/cpu/libc lists are allow lists unless every entry is negated.
export function supportedSlot(record, host) {
  const accepts = (values, value) =>
    !values ||
    (values.every(entry => entry.startsWith('!'))
      ? !values.includes('!' + value)
      : value !== null && values.includes(value));
  return (
    accepts(record.os, host.platform) &&
    accepts(record.cpu, host.arch) &&
    accepts(record.libc, host.libc)
  );
}

export const safeMember = name =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length < 512 &&
  !name.startsWith('/') &&
  !name.includes('\\') &&
  !name.includes('\0') &&
  !name.split('/').some(part => !part || ['.', '..'].includes(part));

// The lock's own digest pins these candidate bytes; their length follows from the digest.
export function candidateFile(sourceRoot, file, sha256) {
  let stat;
  try {
    stat = fs.lstatSync(path.join(sourceRoot, file));
  } catch {
    fail('missing candidate ' + file);
  }
  if (!stat.isFile()) fail('candidate file ' + file);
  return exact(sourceRoot, file, { sha256, bytes: stat.size, mode: '100644' });
}

function validatePatch(record, lockHash) {
  const patch = record.patch;
  if (
    !patch ||
    typeof patch !== 'object' ||
    !PATCH_FILE.test(patch.file ?? '') ||
    patch.lockHash !== lockHash ||
    !ID.test(patch.sha256 ?? '') ||
    !Number.isInteger(patch.bytes) ||
    patch.bytes <= 0 ||
    patch.bytes > MAX_PATCH_BYTES ||
    !['100644', '100755'].includes(patch.mode) ||
    !patch.patchedFiles ||
    typeof patch.patchedFiles !== 'object' ||
    Array.isArray(patch.patchedFiles) ||
    !Object.keys(patch.patchedFiles).length
  )
    fail('patch identity ' + label(record));
  for (const [file, digest] of Object.entries(patch.patchedFiles))
    if (!safeMember(file) || !ID.test(digest)) fail('patched file ' + file.slice(0, 80));
}

function validateRecord(id, record) {
  if (!ID.test(id) || typeof record?.snapshot !== 'string' || hash(record.snapshot) !== id)
    fail('record key ' + id);
  const base = record.snapshot.split('(')[0];
  const at = base.lastIndexOf('@');
  if (at < 1 || record.name !== base.slice(0, at) || record.version !== base.slice(at + 1))
    fail('snapshot identity ' + base);
  if (!NAME.test(record.name) || !VERSION.test(record.version)) fail('package identity ' + base);
  const file = record.name.split('/').at(-1) + '-' + record.version + '.tgz';
  if (record.resolved !== REGISTRY + record.name + '/-/' + file) fail('registry archive ' + base);
  if (!INTEGRITY.test(record.integrity ?? '')) fail('archive integrity identity ' + base);
  for (const key of ['os', 'cpu', 'libc']) {
    const values = record[key];
    if (values === undefined) continue;
    if (
      !Array.isArray(values) ||
      !values.length ||
      values.some(entry => typeof entry !== 'string' || !/^!?[a-z0-9]+$/u.test(entry))
    )
      fail('platform ' + key + ' ' + base);
  }
  for (const kind of ['dependencies', 'optionalDependencies']) {
    const edges = record[kind];
    if (!edges || typeof edges !== 'object' || Array.isArray(edges)) fail(kind + ' map ' + base);
    for (const [name, dep] of Object.entries(edges))
      if (!NAME.test(name) || !ID.test(dep)) fail(kind + ' edge ' + base + ' ' + name);
  }
  const marker = PATCH_MARKER.exec(record.snapshot);
  if (Boolean(marker) !== Boolean(record.patch)) fail('patch marker ' + base);
  if (record.patch) validatePatch(record, marker[1]);
}

const canonical = lock => [
  lock.version,
  lock.sourceLockSha256,
  lock.workspaceSha256,
  sorted(lock.roots),
  Object.keys(lock.packages)
    .sort()
    .map(id => {
      const record = lock.packages[id];
      return [
        id,
        record.integrity,
        sorted(record.dependencies),
        sorted(record.optionalDependencies),
        record.patch?.sha256 ?? null,
        [record.os ?? null, record.cpu ?? null, record.libc ?? null],
      ];
    }),
];

export const graphDigest = lock => hash(JSON.stringify(canonical(lock)));

function assertEdge(records, name, dep, from) {
  if (!ID.test(dep) || !Object.hasOwn(records, dep))
    fail('unknown dependency slot ' + name + ' of ' + from);
  if (records[dep].name !== name) fail('dependency edge name ' + name + ' of ' + from);
}

// Required slots must exist for this host; unsupported optional slots are omitted, never substituted.
export function resolveCrmGraph(lock, sourceRoot, host) {
  if (!lock || typeof lock !== 'object' || lock.version !== 1) fail('lock version');
  if (!ID.test(lock.sourceLockSha256 ?? '') || !ID.test(lock.workspaceSha256 ?? ''))
    fail('lock digests');
  candidateFile(sourceRoot, 'pnpm-lock.yaml', lock.sourceLockSha256);
  candidateFile(sourceRoot, 'pnpm-workspace.yaml', lock.workspaceSha256);
  const records = lock.packages;
  if (!records || typeof records !== 'object' || Array.isArray(records)) fail('packages map');
  const ids = Object.keys(records);
  if (!ids.length || ids.length > MAX_SLOTS) fail('packages size');
  for (const id of ids) validateRecord(id, records[id]);
  const roots = lock.roots;
  if (!roots || typeof roots !== 'object' || Array.isArray(roots) || !Object.keys(roots).length)
    fail('roots map');
  const slots = [];
  const installed = new Set();
  const omitted = {};
  const visit = (id, kind, from) => {
    const record = records[id];
    if (installed.has(id)) return;
    if (!supportedSlot(record, host)) {
      if (kind === 'required')
        fail('unsupported required slot ' + label(record) + ' on ' + host.key);
      omitted[id] = { name: record.name, version: record.version, reason: 'platform', from };
      return;
    }
    installed.add(id);
    for (const [name, dep] of sorted(record.dependencies)) {
      assertEdge(records, name, dep, label(record));
      visit(dep, 'required', label(record));
    }
    for (const [name, dep] of sorted(record.optionalDependencies)) {
      assertEdge(records, name, dep, label(record));
      visit(dep, 'optional', label(record));
    }
    slots.push(id);
  };
  for (const [name, id] of sorted(roots)) {
    if (!NAME.test(name)) fail('root name ' + name);
    if (!ID.test(id) || records[id]?.name !== name) fail('root slot ' + name);
    visit(id, 'required', 'roots');
  }
  if (Object.keys(omitted).some(id => installed.has(id))) fail('omitted slot also installed');
  return {
    host,
    records,
    roots: { ...roots },
    slots,
    installed,
    omitted,
    graphSha256: graphDigest(lock),
  };
}
