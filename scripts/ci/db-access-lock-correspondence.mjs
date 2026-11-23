import fs from 'node:fs';
import path from 'node:path';
import { lockImporters } from './db-access-lock-projection.mjs';

// Main-only contract for the G0 lockfile projection: the projection drops first-party links, so
// the checkout must show that every such link is exactly what the manifests declare, and the
// reverse. CI's frozen-lockfile install enforces the same correspondence for installation.
const BLOCKS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const SCOPE = '@interdomestik/';
const WORKSPACE_ROOTS = ['apps', 'packages'];

// A regular file reached only through real directories inside the root.
function regularFile(root, relative) {
  let current = root;
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      return `missing ${relative}`;
    }
    if (stat.isSymbolicLink()) return `symlink ${relative}`;
    if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())
      return `non-regular ${relative}`;
  }
  return null;
}

function readManifest(root, relative, problems) {
  const problem = regularFile(root, relative);
  if (problem) return void problems.push(problem);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  } catch {
    return void problems.push(`unparseable ${relative}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return void problems.push(`not an object ${relative}`);
  if (typeof value.name !== 'string' || value.name === '')
    return void problems.push(`no package name ${relative}`);
  return value;
}

const key = (block, name) => `${block} ${name}`;

// The importer's first-party manifest declarations; a non-workspace specifier is a problem.
function declaredLinks(manifest, importer, problems) {
  const declared = new Set();
  for (const block of BLOCKS) {
    const entries = manifest[block];
    if (entries === undefined) continue;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      problems.push(`malformed ${block} ${importer}`);
      continue;
    }
    for (const [name, spec] of Object.entries(entries)) {
      if (!name.startsWith(SCOPE)) continue;
      if (spec !== 'workspace:*') problems.push(`non-workspace ${importer} ${name} ${spec}`);
      declared.add(key(block, name));
    }
  }
  return declared;
}

// The importer's first-party lockfile links, already canonical; each target must carry that name.
function lockedLinks(root, blocks, problems) {
  const linked = new Set();
  for (const [block, entries] of blocks)
    for (const name of entries.keys()) {
      if (!name.startsWith(SCOPE)) continue;
      linked.add(key(block, name));
      const target = `packages/${name.slice(SCOPE.length)}/package.json`;
      const owner = readManifest(root, target, problems);
      if (owner && owner.name !== name) problems.push(`target ${target} is not ${name}`);
    }
  return linked;
}

function compareImporter(root, importer, blocks, problems) {
  const dir = importer === '.' ? '' : `${importer}/`;
  const manifest = readManifest(root, `${dir}package.json`, problems);
  if (!manifest) return null;
  const declared = declaredLinks(manifest, importer, problems);
  const linked = lockedLinks(root, blocks, problems);
  for (const item of declared)
    if (!linked.has(item)) problems.push(`declared, not linked: ${importer} ${item}`);
  for (const item of linked)
    if (!declared.has(item)) problems.push(`linked, not declared: ${importer} ${item}`);
  return manifest.name;
}

function packagesWithoutImporter(root, importers, problems) {
  for (const top of WORKSPACE_ROOTS) {
    const full = path.join(root, top);
    if (!fs.existsSync(full)) continue;
    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      const relative = `${top}/${entry.name}`;
      const manifest = path.join(full, entry.name, 'package.json');
      if (entry.isSymbolicLink()) problems.push(`symlink ${relative}`);
      else if (entry.isDirectory() && fs.existsSync(manifest) && !importers.has(relative))
        problems.push(`package without an importer ${relative}`);
    }
  }
}

function readImporters(root) {
  const lockProblem = regularFile(root, 'pnpm-lock.yaml');
  if (lockProblem) return { problem: lockProblem };
  try {
    return { importers: lockImporters(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))) };
  } catch (error) {
    return { problem: error.message };
  }
}

/** Every mismatch between first-party lockfile links and manifest declarations; [] when exact. */
export function lockManifestProblems(root) {
  const { importers, problem } = readImporters(root);
  if (problem) return [problem];
  const problems = [];
  if (!importers.has('.')) problems.push('no root importer');
  const owners = new Map();
  for (const [importer, blocks] of importers) {
    const name = compareImporter(root, importer, blocks, problems);
    if (name === null) continue;
    if (owners.has(name))
      problems.push(`package name ${name} in ${owners.get(name)} and ${importer}`);
    else owners.set(name, importer);
  }
  packagesWithoutImporter(root, importers, problems);
  return problems;
}
