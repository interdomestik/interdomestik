// Confined access to an extracted target tree (WP-05 code review r1, B11). An extracted revision
// can carry committed symbolic links, so every scanner input read from it, and every input the
// replay synthesizes into it, goes through a path whose segments below the root are no links.
import fs from 'node:fs';
import path from 'node:path';

import { ScanError } from '../server-mutation/ast.mjs';

// Throws when `rel` leaves `root` or when an existing segment of it below `root` is a link.
// Returns the absolute path, and whether the full path exists.
export function confined(root, rel) {
  const parts = rel.split('/');
  if (path.isAbsolute(rel) || parts.some(part => part === '..' || part === '' || part === '.'))
    throw new ScanError(`${rel} is not a plain path inside the tree`);
  let abs = root;
  for (const part of parts) {
    abs = path.join(abs, part);
    let stat;
    try {
      stat = fs.lstatSync(abs);
    } catch {
      return { abs: path.join(root, ...parts), exists: false };
    }
    if (stat.isSymbolicLink()) throw new ScanError(`${rel}: ${part} is a symbolic link`);
  }
  return { abs, exists: true };
}

// The text of a file inside the tree, or null when it does not exist.
export function readInside(root, rel) {
  const { abs, exists } = confined(root, rel);
  return exists ? fs.readFileSync(abs, 'utf8') : null;
}

// Writes a file inside the tree, creating its directories; refuses a link on the way.
export function writeInside(root, rel, text) {
  const { abs } = confined(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  confined(root, rel);
  fs.writeFileSync(abs, text, { flag: 'wx' });
}
