// Confined access to an extracted target tree (WP-05 code review r1, B11). An extracted revision
// can carry committed symbolic links, so every scanner input read from it, and every input the
// replay synthesizes into it, goes through a path whose segments below the root are no links.
import fs from 'node:fs';
import path from 'node:path';

import { ScanError } from '../server-mutation/ast.mjs';

// A plain repository path: relative, `/`-separated, no empty, `.` or `..` segment, no backslash
// and no `|` (it separates the fields of an item key, r2 B9).
const PLAIN_RE = /^[^/\\|]+(?:\/[^/\\|]+)*$/u;
export const isPlainPath = rel =>
  typeof rel === 'string' &&
  PLAIN_RE.test(rel) &&
  !rel.split('/').some(p => p === '.' || p === '..');

// A plain path of a source file under a linted root, with a linted source extension (r1 B9).
const SOURCE_RE =
  /^(?:apps\/web\/src|packages\/[\w.-]+\/src)\/.+\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;
export const isCanonicalSource = rel => isPlainPath(rel) && SOURCE_RE.test(rel);

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

// An extracted revision holds no symbolic link at all (r2 B3): the repository tracks none, and one
// would let a read (a catalogue, a manifest, a tsconfig, a source ESLint lints) leave the tree, so
// the same two revisions could give different verdicts on different runners.
export function assertNoLinks(root) {
  const pending = [''];
  while (pending.length) {
    const rel = pending.pop();
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new ScanError(`${child} is a symbolic link`);
      if (entry.isDirectory()) pending.push(child);
    }
  }
}
