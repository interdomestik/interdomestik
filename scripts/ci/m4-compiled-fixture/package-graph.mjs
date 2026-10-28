// Preparation only; no installs/network and no execution of dependency entrypoints.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { hashFile } from './project/image-custody.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
export function resolveInstalledPackage(from, name, installedRoot) {
  if (
    !/^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+$/u.test(name) ||
    name.split('/').some(part => part === '.' || part === '..')
  )
    throw Error('Installed package name refused');
  const installed = fs.realpathSync(installedRoot),
    candidate = path.dirname(installed);
  const source = fs.realpathSync(from);
  if (path.basename(installed) !== 'node_modules' || !source.startsWith(candidate + path.sep))
    throw Error('Installed package source scope refused');
  const require = createRequire(path.join(source, 'package.json'));
  const search = require.resolve.paths(name);
  if (!Array.isArray(search) || search.length > 64) throw Error('Installed search scope refused');
  for (const base of search) {
    if (!base.startsWith(candidate + path.sep)) continue;
    const logical = path.join(base, name);
    let root;
    try {
      root = fs.realpathSync(logical);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
      throw error;
    }
    if (!root.startsWith(installed + path.sep))
      throw Error('Installed package escaped pinned tree');
    const file = path.join(root, 'package.json'),
      before = fs.lstatSync(file);
    if (!before.isFile() || before.size < 1 || before.size > 1024 * 1024)
      throw Error('Installed package manifest refused');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')),
      after = fs.lstatSync(file);
    if (
      manifest.name !== name ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw Error('Installed package manifest identity changed');
    return root;
  }
  const error = Error('Installed package absent: ' + name);
  error.code = 'MODULE_NOT_FOUND';
  throw error;
}
export function installedPackagePath(target, id, name) {
  return path.join(target, '.packages', id, 'node_modules', name);
}
export function linkInstalledPackage(parent, name, destination) {
  const dst = path.join(parent, 'node_modules', name);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.symlinkSync(path.relative(path.dirname(dst), destination), dst);
}
export function installedPackageId(installedRoot, source) {
  if (!path.isAbsolute(installedRoot) || !path.isAbsolute(source))
    throw Error('Installed package identity scope refused');
  const relative = path.relative(installedRoot, source).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative))
    throw Error('Installed package identity scope refused');
  return sha(relative).slice(0, 20);
}
export function materializePackages(from, target) {
  const installedRoot = fs.realpathSync(path.resolve(from, '../../node_modules'));
  const packageRoot = (source, name) => resolveInstalledPackage(source, name, installedRoot);
  const nodes = new Map(),
    edges = [],
    choices = [];
  function collect(source) {
    if (nodes.has(source)) return nodes.get(source);
    if (nodes.size >= 256) throw Error('Fixed installed graph cap');
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
    const id = installedPackageId(installedRoot, source);
    if ([...nodes.values()].some(item => item.id === id))
      throw Error('Installed package identity collision');
    const node = { id, source, manifest, dependencies: {} };
    nodes.set(source, node);
    const required = { ...manifest.dependencies, ...manifest.peerDependencies };
    const optional = { ...manifest.optionalDependencies };
    for (const [name, meta] of Object.entries(manifest.peerDependenciesMeta ?? {}))
      if (meta.optional) {
        optional[name] = required[name];
        delete required[name];
      }
    for (const name of Object.keys({ ...required, ...optional }).sort()) {
      let root;
      try {
        root = packageRoot(source, name);
      } catch (error) {
        if (!Object.hasOwn(optional, name) || error.code !== 'MODULE_NOT_FOUND') throw error;
        choices.push({ package: manifest.name, optional: name, installed: false });
        continue;
      }
      const child = collect(root);
      node.dependencies[name] = child.id;
      edges.push({ from: id, name, to: child.id });
    }
    return node;
  }
  const roots = {};
  for (const name of ['next', 'react', 'react-dom', '@playwright/test'])
    roots[name] = collect(packageRoot(from, name)).id;
  const next = [...nodes.values()].find(x => x.id === roots.next);
  if (next.manifest.version !== '16.4.3') throw Error('Next version changed');
  const native =
    '@next/swc-' +
    process.platform +
    '-' +
    process.arch +
    (process.platform === 'linux' ? '-gnu' : '');
  if (!next.dependencies[native])
    throw Error('Installed matching SWC absent; no download fallback');
  let bytes = 0,
    files = 0;
  function copyTree(source, out, base = source) {
    fs.mkdirSync(out, { recursive: true });
    for (const name of fs.readdirSync(source).sort()) {
      if (source === base && name === 'node_modules') continue;
      const src = path.join(source, name),
        dst = path.join(out, name),
        a = fs.lstatSync(src);
      if (a.isSymbolicLink()) {
        const real = fs.realpathSync(src),
          link = fs.readlinkSync(src);
        if (path.isAbsolute(link) || !real.startsWith(base + path.sep))
          throw Error('Unclassified package symlink');
        fs.symlinkSync(link, dst);
      } else if (a.isDirectory()) copyTree(src, dst, base);
      else if (a.isFile()) {
        bytes += a.size;
        files++;
        if (bytes > 2 * 1024 ** 3 || files > 100000) throw Error('Installed copy budget');
        fs.copyFileSync(src, dst);
        const b = fs.statSync(src);
        if (
          a.size !== b.size ||
          a.mtimeMs !== b.mtimeMs ||
          a.ctimeMs !== b.ctimeMs ||
          hashFile(src) !== hashFile(dst)
        )
          throw Error('Installed input changed');
      } else throw Error('Installed filesystem kind refused');
    }
  }
  const byId = new Map([...nodes.values()].map(node => [node.id, node]));
  const location = id => installedPackagePath(target, id, byId.get(id).manifest.name);
  for (const node of nodes.values()) copyTree(node.source, location(node.id));
  for (const [name, id] of Object.entries(roots)) linkInstalledPackage(target, name, location(id));
  for (const node of nodes.values())
    for (const [name, id] of Object.entries(node.dependencies))
      linkInstalledPackage(location(node.id), name, location(id));
  return {
    roots,
    nodes: [...nodes.values()].map(x => ({
      id: x.id,
      source: x.source,
      name: x.manifest.name,
      version: x.manifest.version,
      packageSha256: hashFile(path.join(x.source, 'package.json')),
      dependencies: x.dependencies,
    })),
    edges,
    choices,
    copiedBytes: bytes,
    copiedFiles: files,
  };
}
