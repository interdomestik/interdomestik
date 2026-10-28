// Preparation paths are physical children of an already owned directory; this is not runtime authority.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import fixed from '../db-access-m4-compiled-contract.json' with { type: 'json' };
import { census, hashFile } from './project/image-custody.mjs';
export function ownedTarget(parent, name, requireExisting = false) {
  if (
    typeof parent !== 'string' ||
    !path.isAbsolute(parent) ||
    fs.realpathSync(parent) !== parent ||
    !/^m4-compiled-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      name
    ) ||
    typeof process.getuid !== 'function'
  )
    throw Error('Owned preparation root refused');
  const stat = fs.lstatSync(parent);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o7777) !== 0o700
  )
    throw Error('Owned preparation root refused');
  const target = path.join(parent, name);
  if (requireExisting) {
    const child = fs.lstatSync(target);
    if (
      !child.isDirectory() ||
      child.isSymbolicLink() ||
      child.uid !== process.getuid() ||
      (child.mode & 0o7777) !== 0o700 ||
      fs.realpathSync(target) !== target
    )
      throw Error('Owned preparation target refused');
  } else if (fs.existsSync(target)) throw Error('Fresh preparation target required');
  return target;
}
export function verifyInstalledClosure(project) {
  const all = census(project),
    selected = Object.fromEntries(
      Object.entries(all)
        .filter(([name]) => name.startsWith('.packages/') || name.startsWith('node_modules/'))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    );
  const digest = createHash('sha256').update(JSON.stringify(selected)).digest('hex');
  if (
    Object.keys(selected).length !== fixed.installedClosure.records ||
    digest !== fixed.installedClosure.sha256 ||
    process.version !== fixed.installedClosure.nodeVersion ||
    hashFile(process.execPath) !== fixed.installedClosure.nodeExecutableSha256
  )
    throw Error('Fixed installed compiler/browser package closure refused');
  return Object.freeze({ digest, records: Object.keys(selected).length, runtimeAdmission: false });
}
