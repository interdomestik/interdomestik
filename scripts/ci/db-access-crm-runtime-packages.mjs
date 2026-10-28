import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { hash, refuse } from './db-access-provider-runtime-identity.mjs';
import { hostIdentity, label, resolveCrmGraph } from './db-access-crm-runtime-graph.mjs';
import { installArchive } from './db-access-crm-runtime-archive.mjs';
import { applyCrmPatch } from './db-access-crm-runtime-patch.mjs';

const fail = reason => refuse('crm package install: ' + reason);

const SLOTS = 'node_modules/.crm';
const UNSAFE_NODE_OPTIONS = /--(?:require|import|loader|experimental-loader|conditions)\b/u;

const slotDirectory = id => path.join(SLOTS, id);
const packageDirectory = (id, name) => path.join(SLOTS, id, 'node_modules', name);

function ownedDirectory(candidate, name) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) fail(name + ' path');
  let real;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    fail('missing ' + name);
  }
  if (!fs.lstatSync(real).isDirectory()) fail(name + ' directory');
  return real;
}

// Node must never resolve a CRM package through NODE_PATH, a loader, or an ancestor project.
function assertIsolation(root) {
  if (process.env.NODE_PATH) fail('inherited NODE_PATH');
  if (UNSAFE_NODE_OPTIONS.test(process.env.NODE_OPTIONS ?? '')) fail('inherited NODE_OPTIONS');
  if (root.split(path.sep).includes('node_modules')) fail('assembly inside node_modules');
  for (let dir = path.dirname(root); ;) {
    if (fs.existsSync(path.join(dir, 'node_modules'))) fail('ancestor node_modules ' + dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

function sanitizedEnv(root) {
  const home = path.join(root, 'home');
  const temp = path.join(root, 'tmp');
  for (const dir of [home, temp]) fs.mkdirSync(dir, { recursive: true });
  return {
    PATH: '/usr/bin:/bin',
    HOME: home,
    TMPDIR: temp,
    TZ: 'UTC',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
  };
}

function linkSlot(root, from, to) {
  const link = path.join(root, from);
  const target = path.join(root, to);
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(path.relative(path.dirname(link), target), link, 'dir');
  if (fs.realpathSync(link) !== fs.realpathSync(target)) fail('link target ' + from);
}

// Each slot resolves its own exact peer instances from its own node_modules; roots point at slots.
function linkGraph(root, plan) {
  for (const id of plan.slots) {
    const record = plan.records[id];
    for (const [kind, edges] of [
      ['required', record.dependencies],
      ['optional', record.optionalDependencies],
    ])
      for (const [name, dep] of Object.entries(edges).sort()) {
        if (!plan.installed.has(dep)) {
          if (kind === 'required') fail('missing required slot ' + name + ' of ' + label(record));
          continue;
        }
        // A peer cycle may name the slot's own package; the extracted package already owns the path.
        if (name === record.name) {
          if (dep !== id) fail('self dependency instance ' + label(record));
          continue;
        }
        linkSlot(
          root,
          path.join(slotDirectory(id), 'node_modules', name),
          packageDirectory(dep, name)
        );
      }
  }
  const links = {};
  for (const [name, id] of Object.entries(plan.roots).sort()) {
    const link = path.join('node_modules', name);
    linkSlot(root, link, packageDirectory(id, name));
    links[name] = { slot: id, link, target: packageDirectory(id, name) };
  }
  return links;
}

function compilerIdentity(root, plan) {
  const esbuild = plan.roots.esbuild;
  if (!esbuild || !plan.installed.has(esbuild)) fail('missing esbuild root');
  const native = plan.records[esbuild].optionalDependencies[plan.host.compiler];
  if (!native || !plan.installed.has(native)) fail('missing compiler slot ' + plan.host.compiler);
  if (plan.records[native].version !== plan.records[esbuild].version)
    fail('compiler version skew ' + plan.host.compiler);
  const binary = path.join(root, packageDirectory(native, plan.host.compiler), 'bin/esbuild');
  if (
    !fs.existsSync(binary) ||
    !fs.lstatSync(binary).isFile() ||
    fs.realpathSync(binary) !== binary
  )
    fail('compiler binary ' + plan.host.compiler);
  fs.chmodSync(binary, 0o755);
  return {
    package: plan.host.compiler,
    version: plan.records[native].version,
    slot: native,
    binary,
    sha256: hash(fs.readFileSync(binary)),
  };
}

// The fixed producer authenticates the lock before this call; this installs that graph and nothing else.
export function installCrmPackages({ lock, sourceRoot, root, tarballRoot, host = hostIdentity() }) {
  const base = ownedDirectory(root, 'assembly root');
  const source = ownedDirectory(sourceRoot, 'candidate root');
  const archives = path.join(ownedDirectory(tarballRoot, 'archive root'), 'crm');
  if (base === source || base.startsWith(source + path.sep)) fail('assembly inside candidate');
  assertIsolation(base);
  const plan = resolveCrmGraph(lock, source, host);
  const modules = path.join(base, 'node_modules');
  if (fs.existsSync(modules)) fail('existing node_modules');
  fs.mkdirSync(path.join(base, SLOTS), { recursive: true });
  const env = sanitizedEnv(base);
  const run = (binary, args, cwd = base) =>
    execFileSync(binary, args, {
      cwd,
      env,
      shell: false,
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  const packages = {};
  const patches = {};
  for (const id of plan.slots) {
    const record = plan.records[id];
    const directory = path.join(base, packageDirectory(id, record.name));
    fs.mkdirSync(directory, { recursive: true });
    const archive = installArchive({ archives, record, directory, run });
    packages[id] = {
      name: record.name,
      version: record.version,
      snapshot: record.snapshot,
      resolved: record.resolved,
      integrity: record.integrity,
      archiveSha256: archive.sha256,
      archiveBytes: archive.bytes,
      members: archive.members,
      directory: path.relative(base, directory),
    };
    if (record.patch)
      patches[id] = applyCrmPatch({
        record,
        sourceRoot: source,
        directory,
        slotDir: path.join(base, slotDirectory(id)),
        run,
      });
  }
  const links = linkGraph(base, plan);
  return {
    root: base,
    modules,
    host: plan.host.key,
    lock: {
      version: lock.version,
      sourceLockSha256: lock.sourceLockSha256,
      workspaceSha256: lock.workspaceSha256,
      graphSha256: plan.graphSha256,
    },
    installed: plan.slots.length,
    packages,
    patches,
    omitted: plan.omitted,
    links,
    compiler: compilerIdentity(base, plan),
    policyActivated: false,
  };
}
