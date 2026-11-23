// Read workspace and authenticated Git sources as data for the tenant guard.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createModuleGraph } from './modules.mjs';
import { resolutionConfig, resolverInput, workspaceDirs } from './resolution.mjs';

const GIT = '/usr/bin/git';

export const SOURCE = /\.[cm]?[jt]sx?$/u;
const GENERATED = /(^|\/)(node_modules|dist|build|coverage|test-results|\.next|\.turbo)(\/|$)/u;
const ROOTS = ['apps/web/src', 'packages'];
const MAX_FILES = 15000;
const MAX_BYTES = 64 * 1024 * 1024;
const REGULAR = /^100(?:644|755)$/u;
const HEX = /^[0-9a-f]{40}$/u;
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export const inScanRoots = file => ROOTS.some(root => file.startsWith(`${root}/`));
const isSource = file => SOURCE.test(file) && !GENERATED.test(file);

function decode(bytes, file, role) {
  try {
    return UTF8.decode(bytes);
  } catch {
    throw new Error(`${role}: malformed UTF-8 blob ${file}`);
  }
}

function bounded(sources) {
  let bytes = 0;
  for (const text of sources.values()) bytes += Buffer.byteLength(text);
  if (sources.size > MAX_FILES || bytes > MAX_BYTES)
    throw new Error('incomplete: source bound exceeded');
  return sources;
}

/** The working tree's sources under the guarded roots. Symlinks and path escapes fail closed. */
export function currentSources(repoRoot) {
  const sources = new Map();
  const realRoot = fs.realpathSync(repoRoot);
  const walk = relative => {
    const full = path.join(repoRoot, relative);
    if (!fs.existsSync(full)) return;
    for (const item of fs.readdirSync(full, { withFileTypes: true })) {
      const file = `${relative}/${item.name}`;
      if (GENERATED.test(file)) continue;
      if (item.isSymbolicLink()) throw new Error(`incomplete: source symlink ${file}`);
      if (item.isDirectory()) walk(file);
      else if (SOURCE.test(file)) {
        const real = fs.realpathSync(path.join(repoRoot, file));
        if (!real.startsWith(realRoot + path.sep))
          throw new Error(`incomplete: path escape ${file}`);
        sources.set(file, decode(fs.readFileSync(real), file, 'checkout'));
      }
    }
  };
  for (const root of ROOTS) walk(root);
  return bounded(sources);
}

function git(repoRoot, args, input) {
  return execFileSync(GIT, ['--no-replace-objects', ...args], {
    cwd: repoRoot,
    input,
    maxBuffer: MAX_BYTES + 4 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function gitIdentity(repoRoot, revision) {
  const commit = git(repoRoot, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${revision}^{commit}`,
  ])
    .toString()
    .trim();
  const tree = git(repoRoot, ['rev-parse', '--verify', `${commit}^{tree}`])
    .toString()
    .trim();
  return { commit, tree };
}

export function gitAncestor(repoRoot, ancestor, descendant) {
  try {
    git(repoRoot, ['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function gitEntries(repoRoot, ref, role, paths = [], allowUnpinnedTree = false) {
  const { commit, tree } = ref ?? {};
  if (commit == null || (tree == null && !allowUnpinnedTree))
    throw new Error(`missing ${role} commit/tree`);
  if (commit === '' || tree === '') throw new Error(`empty ${role} commit/tree`);
  if (!HEX.test(commit) || (tree != null && !HEX.test(tree)))
    throw new Error(`invalid ${role} commit/tree`);
  let identity;
  try {
    identity = gitIdentity(repoRoot, commit);
  } catch {
    throw new Error(`${role} commit unavailable`);
  }
  if (identity.commit !== commit) throw new Error(`${role} object is not a commit`);
  if (tree != null && identity.tree !== tree) throw new Error(`${role} tree mismatch`);
  const listing = git(repoRoot, ['ls-tree', '-r', '-t', '-z', identity.tree, '--', ...paths]);
  return entriesFromListing(listing, role);
}

function entriesFromListing(listing, role) {
  const entries = new Map();
  for (const record of decode(listing, '<tree>', role).split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    const [mode, kind, oid] = record.slice(0, tab).split(' ');
    const file = record.slice(tab + 1);
    if (tab < 0 || !HEX.test(oid) || entries.has(file))
      throw new Error(`${role}: invalid tree entry`);
    entries.set(file, { mode, kind, oid });
  }
  return entries;
}

function gitBlobs(repoRoot, entries, selects, role) {
  const selected = [...entries].filter(([file, { kind }]) => kind !== 'tree' && selects(file));
  const blobs = new Map();
  if (selected.length === 0) return blobs;
  if (selected.length > MAX_FILES) throw new Error(`${role}: source bound exceeded`);
  for (const [file, { mode, kind }] of selected)
    if (!REGULAR.test(mode) || kind !== 'blob')
      throw new Error(`${role}: non-regular blob ${file}`);
  let batch;
  try {
    batch = git(
      repoRoot,
      ['cat-file', '--batch'],
      selected.map(([, { oid }]) => `${oid}\n`).join('')
    );
  } catch {
    throw new Error(`${role}: Git blob batch unavailable`);
  }
  let offset = 0;
  for (const [file, { oid }] of selected) {
    const headerEnd = batch.indexOf(0x0a, offset);
    const [object, kind, size] = batch.subarray(offset, headerEnd).toString('ascii').split(' ');
    const start = headerEnd + 1;
    const end = start + Number(size);
    if (
      headerEnd < offset ||
      object !== oid ||
      kind !== 'blob' ||
      !/^\d+$/u.test(size) ||
      batch[end] !== 0x0a
    )
      throw new Error(`${role}: invalid blob response for ${file}`);
    blobs.set(file, decode(batch.subarray(start, end), file, role));
    offset = end + 1;
  }
  if (batch.length !== offset) throw new Error(`${role}: incomplete blob response`);
  return bounded(blobs);
}

/** The trusted comparator is read by exact object identity, with a local revision opt-in. */
export function trustedSources(repoRoot, ref) {
  return gitBlobs(repoRoot, gitEntries(repoRoot, ref, 'trusted', ROOTS, true), isSource, 'trusted');
}

/** A complete source and resolver inventory from the authenticated object store. */
export function readSchemaTree(repoRoot, ref, role) {
  const files = gitEntries(repoRoot, ref, role);
  const blobs = gitBlobs(
    repoRoot,
    files,
    file => isSource(file) || (!GENERATED.test(file) && resolverInput(file)),
    role
  );
  return schemaTreeFromBlobs(blobs, files);
}

export function schemaTreeFromBlobs(
  blobs,
  files = new Map([...blobs.keys()].map(file => [file, { mode: '100644' }]))
) {
  const allSources = new Map([...blobs].filter(([file]) => isSource(file)));
  const sources = new Map([...allSources].filter(([file]) => inScanRoots(file)));
  const inputs = new Map(
    [...blobs].filter(([file]) => !GENERATED.test(file) && resolverInput(file))
  );
  const packages = new Map();
  for (const [file, text] of inputs) {
    const match = /^((?:apps|packages)\/[^/]+)\/package\.json$/u.exec(file);
    if (match) recordPackage(packages, match[1], text);
  }
  const resolution = resolutionConfig(null, inputs);
  const workspaceInputs = new Map(
    [...inputs].filter(([file]) => !file.includes('/') || /^(?:apps|packages)\//u.test(file))
  );
  const config = { packages, appAliases: APP_ALIASES, resolution };
  const graph = createModuleGraph({
    ...config,
    resolution: resolutionConfig(null, workspaceInputs),
    sources,
  });
  const inventory = createModuleGraph({ ...config, sources: allSources });
  return { blobs, files, sources, allSources, inputs, graph, inventory, packages, resolution };
}

/** Confirm filesystem data used by the existing scan agrees with the authenticated candidate. */
export function checkoutDiscrepancy(repoRoot, sources, candidate) {
  for (const [file, text] of sources)
    if (candidate.sources.get(file) !== text)
      return `candidate: checkout differs from merge blob ${file}`;
  for (const [file, text] of candidate.sources)
    if (sources.get(file) !== text) return `candidate: checkout differs from merge blob ${file}`;
  for (const [file, text] of candidate.inputs) {
    const full = path.join(repoRoot, file);
    if (
      !fs.existsSync(full) ||
      !fs.lstatSync(full).isFile() ||
      decode(fs.readFileSync(full), file, 'checkout') !== text
    )
      return `candidate: checkout differs from merge blob ${file}`;
  }
  return null;
}

/** Workspace packages: name, directory, exports and main, from each apps/* and packages/* manifest. */
export function workspacePackages(repoRoot) {
  const packages = new Map();
  for (const dir of workspaceDirs(repoRoot)) {
    const manifest = path.join(repoRoot, dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    recordPackage(packages, dir, fs.readFileSync(manifest, 'utf8'));
  }
  return packages;
}

function recordPackage(packages, dir, text) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    throw new Error(`unparseable package manifest ${dir}/package.json`);
  }
  if (typeof pkg?.name !== 'string' || !pkg.name) return;
  if (packages.has(pkg.name)) throw new Error(`ambiguous package manifest ${dir}/package.json`);
  packages.set(pkg.name, {
    name: pkg.name,
    dir,
    exports: pkg.exports ?? null,
    main: pkg.main ?? null,
  });
}

export const APP_ALIASES = [['@/', 'apps/web/src/']];
