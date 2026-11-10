// Repository access for seed confinement only; the C1 source set/resolver is unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { SOURCE } from './sources.mjs';

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
  // Scan every repository manifest, including non-workspace and generated directories.
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
  walk('');
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
