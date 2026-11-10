// Repository access for seed confinement only; the C1 source set/resolver is unchanged.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SOURCE } from './sources.mjs';

const GIT = '/usr/bin/git';
const OMIT = new Set(['.git', 'node_modules']);
const MAX_ENTRIES = 200000;
const MAX_FILES = 20000;
const MAX_BYTES = 96 * 1024 * 1024;

export function seedRepository(repoRoot, sources) {
  const root = fs.realpathSync(repoRoot);
  const texts = new Map(sources);
  const manifests = [];
  let entries = 0;
  let bytes = [...texts.values()].reduce((sum, text) => sum + Buffer.byteLength(text), 0);
  function read(file) {
    if (texts.has(file)) return texts.get(file);
    const full = path.resolve(root, file);
    if (!full.startsWith(root + path.sep)) throw new Error(`incomplete: seed path escape ${file}`);
    if (!fs.existsSync(full)) return null;
    if (fs.realpathSync(full) !== full) throw new Error(`incomplete: seed source symlink ${file}`);
    const stat = fs.statSync(full);
    if (!stat.isFile()) return null;
    bytes += stat.size;
    if (texts.size >= MAX_FILES || bytes > MAX_BYTES)
      throw new Error('incomplete: seed source bound exceeded');
    const text = fs.readFileSync(full, 'utf8');
    texts.set(file, text);
    return text;
  }
  // Without Git, scan every manifest, including non-workspace and generated directories.
  // Dependency installations and Git metadata are not repository package configuration.
  function walk(dir) {
    for (const item of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (++entries > MAX_ENTRIES) throw new Error('incomplete: seed repository bound exceeded');
      if (OMIT.has(item.name)) continue;
      const file = path.posix.join(dir, item.name);
      if (item.isSymbolicLink()) throw new Error(`incomplete: seed repository symlink ${file}`);
      if (item.isDirectory()) walk(file);
      else if (item.name === 'package.json') {
        manifests.push({ ...JSON.parse(read(file)), dir, file });
      }
    }
  }
  // In a Git work tree, list every tracked or unignored manifest (what a commit can carry);
  // ignored build output and nested worktrees are never package configuration. Without Git
  // (fixtures), walk the whole directory.
  const tracked = gitManifests(root);
  if (tracked) {
    for (const file of tracked) {
      if (file.split('/').some(part => OMIT.has(part))) continue;
      const text = read(file);
      if (text === null) continue;
      manifests.push({
        ...JSON.parse(text),
        dir: path.posix.dirname(file).replace(/^\.$/u, ''),
        file,
      });
    }
  } else walk('');
  // scripts/pilot is not a standalone scanned root. Runtime imports into it are followed
  // on demand, just like any other repository bridge; no pilot entrypoint claim is made.
  const runtimeEntries = fs.existsSync(path.join(root, 'apps/web'))
    ? fs
        .readdirSync(path.join(root, 'apps/web'))
        .map(name => `apps/web/${name}`)
        .filter(
          file =>
            SOURCE.test(file) &&
            !/\.d\.[cm]?ts$/u.test(file) &&
            // Only next.config is independently compared byte-for-byte by resolution.mjs.
            !/^apps\/web\/next\.config\.[cm]?[jt]s$/u.test(file)
        )
    : [];
  return { read, manifests, runtimeEntries };
}

function gitManifests(root) {
  let top;
  try {
    top = execFileSync(GIT, ['rev-parse', '--show-toplevel'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .trim();
  } catch {
    return null;
  }
  if (fs.realpathSync(top) !== root) return null;
  const args = [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    ':(glob)**/package.json',
  ];
  return execFileSync(GIT, args, { cwd: root, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}
