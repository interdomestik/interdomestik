import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const digest = value => createHash('sha256').update(value).digest('hex');
const splitPaths = value => value.split('\0').filter(Boolean);
const exec = (root, file, args) =>
  execFileSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });

export function selectUnitPackages(packages, changedFiles) {
  const names = new Set(packages.map(pkg => pkg.name));
  const affected = new Set();
  let reason = 'changed packages and transitive dependents';
  let all = false;
  for (const file of changedFiles) {
    const owners = packages.filter(pkg => file.startsWith(`${pkg.directory}/`));
    if (owners.length !== 1 || /(^|\/)(package\.json|\.env[^/]*|[^/]*config[^/]*)$/.test(file)) {
      all = true;
      reason = 'global, configuration, manifest or unknown change';
    } else affected.add(owners[0].name);
  }
  for (const pkg of packages) {
    for (const field of dependencyFields) {
      const dependencies = pkg.manifest[field];
      if (
        dependencies !== undefined &&
        (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies))
      ) {
        throw new Error(`Invalid ${field} in ${pkg.name}`);
      }
      for (const [name, spec] of Object.entries(pkg.manifest[field] ?? {})) {
        if (typeof spec !== 'string') throw new Error(`Invalid dependency ${name} in ${pkg.name}`);
        if (
          /^(workspace:|link:|file:)/.test(spec) &&
          (!names.has(name) || /^(link:|file:|workspace:[.@/])/.test(spec))
        ) {
          all = true;
          reason = 'uncertain local dependency; select all unit tasks';
        }
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const pkg of packages) {
      const dependencies = dependencyFields.flatMap(field =>
        Object.keys(pkg.manifest[field] ?? {})
      );
      if (!affected.has(pkg.name) && dependencies.some(name => affected.has(name))) {
        affected.add(pkg.name);
        changed = true;
      }
    }
  }
  const selected = packages
    .filter(pkg => (all || affected.has(pkg.name)) && pkg.manifest.scripts?.['test:unit'])
    .map(pkg => pkg.name)
    .sort();
  return { mode: all ? 'all-unit' : 'affected-unit', reason, selected };
}

export function buildUnitPlan(root, baseRef) {
  root = fs.realpathSync(root);
  const git = args => exec(root, 'git', args);
  if (git(['rev-parse', '--show-toplevel']).trim() !== root)
    throw new Error('Expected repository root');
  if (!baseRef || baseRef.startsWith('-'))
    throw new Error('An explicit --base Git ref is required');
  const base = git(['rev-parse', '--verify', `${baseRef}^{commit}`]).trim();
  const head = git(['rev-parse', 'HEAD']).trim();
  const mergeBase = git(['merge-base', base, head]).trim();
  const inventory = JSON.parse(exec(root, 'pnpm', ['-r', 'list', '--depth', '-1', '--json']));
  if (!Array.isArray(inventory) || !inventory.length) throw new Error('Workspace discovery failed');
  const packages = inventory
    .filter(pkg => fs.realpathSync(pkg.path) !== root)
    .map(pkg => {
      const directory = path.relative(root, fs.realpathSync(pkg.path)).split(path.sep).join('/');
      if (!directory || directory.startsWith('../') || path.isAbsolute(directory))
        throw new Error('Workspace escapes root');
      const manifest = JSON.parse(
        fs.readFileSync(path.join(root, directory, 'package.json'), 'utf8')
      );
      if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(manifest.name ?? ''))
        throw new Error('Invalid workspace name');
      return { name: manifest.name, directory, manifest };
    });
  if (!packages.length || new Set(packages.map(pkg => pkg.name)).size !== packages.length) {
    throw new Error('Missing or duplicate workspaces');
  }
  const untracked = splitPaths(git(['ls-files', '--others', '--exclude-standard', '-z'])).sort();
  const changedFiles = [
    ...new Set([
      ...splitPaths(git(['diff', '--name-only', '--no-renames', '-z', mergeBase, '--'])),
      ...untracked,
    ]),
  ].sort();
  const envFiles = [root, ...packages.map(pkg => path.join(root, pkg.directory))]
    .flatMap(directory =>
      fs
        .readdirSync(directory)
        .filter(name => name.startsWith('.env'))
        .map(name => path.join(directory, name))
    )
    .filter(file => fs.statSync(file).isFile())
    .sort();
  const fileHash = file => {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return digest(`symlink:${fs.readlinkSync(file)}`);
    if (!stat.isFile()) throw new Error('Unsupported untracked input; cannot bind selection');
    return digest(fs.readFileSync(file));
  };
  const identity = digest(
    JSON.stringify({
      root,
      base,
      head,
      mergeBase,
      changedFiles,
      packages,
      diff: git(['diff', '--binary', 'HEAD', '--']),
      index: git(['diff', '--cached', '--binary', 'HEAD', '--']),
      untracked: untracked.map(file => [file, fileHash(path.join(root, file))]),
      envFiles: envFiles.map(file => [file, fileHash(file), digest(fs.readFileSync(file))]),
      environment: Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b)),
      node: process.version,
      pnpm: exec(root, 'pnpm', ['--version']).trim(),
    })
  );
  return {
    kind: 'optional-unit-feedback',
    root,
    base,
    head,
    mergeBase,
    identity,
    changedFiles,
    ...selectUnitPackages(packages, changedFiles),
    note: 'Existing unit scripts only; not release evidence. No Turbo cache or database provisioning. Mandatory gates remain unchanged.',
  };
}
