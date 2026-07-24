import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHILD_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;

function assertContained(candidate, anchor) {
  const relative = path.relative(anchor, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Managed path escapes its trusted anchor: ${candidate}`);
  }
  return relative;
}

function assertNotSymlink(candidate) {
  try {
    if (fs.lstatSync(candidate).isSymbolicLink()) {
      throw new Error(`Managed path contains a symbolic link: ${candidate}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export function trustedHomeDirectory(userInfo = os.userInfo) {
  const configuredHome = String(userInfo().homedir || '').trim();
  if (!path.isAbsolute(configuredHome)) {
    throw new Error('Trusted account home is invalid');
  }
  const homeDir = path.resolve(configuredHome);
  if (homeDir === path.parse(homeDir).root) {
    throw new Error('Trusted account home is invalid');
  }
  assertNotSymlink(homeDir);
  return homeDir;
}

export function assertManagedPath(value, anchorValue) {
  const anchor = path.resolve(anchorValue);
  const candidate = path.resolve(value);
  const relative = assertContained(candidate, anchor);
  let cursor = anchor;
  assertNotSymlink(cursor);
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    assertNotSymlink(cursor);
  }
  return candidate;
}

function assertRealContainment(candidate, anchor) {
  const realAnchor = fs.realpathSync(anchor);
  const realCandidate = fs.realpathSync(candidate);
  assertContained(realCandidate, realAnchor);
}

export function ensureManagedDirectory(value, anchorValue) {
  const anchor = path.resolve(anchorValue);
  const candidate = assertManagedPath(value, anchor);
  fs.mkdirSync(candidate, { recursive: true, mode: 0o700 });
  assertManagedPath(candidate, anchor);
  assertRealContainment(candidate, anchor);
  return candidate;
}

export function prepareManagedSubdirectory(parentValue, name, anchorValue, { fresh = false } = {}) {
  if (!CHILD_NAME.test(String(name))) throw new Error('Invalid managed child directory name');
  const anchor = path.resolve(anchorValue);
  const parent = ensureManagedDirectory(parentValue, anchor);
  const child = assertManagedPath(path.join(parent, name), anchor);
  let stats;
  try {
    stats = fs.lstatSync(child);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (stats) {
    if (stats.isSymbolicLink()) {
      throw new Error(`Managed path contains a symbolic link: ${child}`);
    }
    if (!stats.isDirectory()) throw new Error(`Managed path is not a directory: ${child}`);
    if (fresh) throw new Error(`Managed directory already exists: ${child}`);
  } else {
    fs.mkdirSync(child, { mode: 0o700 });
  }
  assertManagedPath(child, anchor);
  assertRealContainment(child, anchor);
  if (path.dirname(fs.realpathSync(child)) !== fs.realpathSync(parent)) {
    throw new Error(`Managed child directory escaped its parent: ${child}`);
  }
  return child;
}
