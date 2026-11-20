// Git access of the server-mutation scanner: the trusted base revision and the scanned head.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ScanError } from './ast.mjs';

// Fixed paths, as the other repository scripts use; never a binary found on PATH.
const GIT = '/usr/bin/git';
const SHA_RE = /^[0-9a-f]{7,64}$/u;

function git(repo, args, options = {}) {
  const result = spawnSync(GIT, ['-C', repo, ...args], {
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...options.env },
  });
  return { ok: result.status === 0, stdout: result.stdout, stderr: String(result.stderr ?? '') };
}

const hasCommit = (repo, sha) => git(repo, ['cat-file', '-e', `${sha}^{commit}`]).ok;

// The base must be a full or abbreviated sha; a shallow clone fetches it once from origin.
export function ensureCommit(repo, sha, label) {
  if (typeof sha !== 'string' || !SHA_RE.test(sha))
    throw new ScanError(`${label} is not a commit sha`);
  if (hasCommit(repo, sha)) return git(repo, ['rev-parse', `${sha}^{commit}`]).stdout.trim();
  if (git(repo, ['remote', 'get-url', 'origin']).ok)
    git(repo, ['fetch', '--quiet', '--no-tags', '--depth', '1', 'origin', sha]);
  if (!hasCommit(repo, sha)) throw new ScanError(`${label} ${sha} cannot be read`);
  return git(repo, ['rev-parse', `${sha}^{commit}`]).stdout.trim();
}

export function headSha(repo) {
  const result = git(repo, ['rev-parse', 'HEAD']);
  if (!result.ok) throw new ScanError('the working tree has no readable HEAD');
  return result.stdout.trim();
}

// File content at a revision, or null when the path does not exist there.
export function showAt(repo, sha, file) {
  if (!git(repo, ['cat-file', '-e', `${sha}:${file}`]).ok) return null;
  const result = git(repo, ['show', `${sha}:${file}`]);
  if (!result.ok) throw new ScanError(`cannot read ${file} at ${sha}`);
  return result.stdout;
}

// The file modes a scanned revision may hold, and the mode each is written with. A link
// (120000), a submodule (160000) or any other entry is refused: the revision is untrusted data.
const FILE_MODES = Object.freeze({ 100644: 0o644, 100755: 0o755 });
const BLOB_BATCH = 2000;

// A tree path that stays inside the extraction directory: no empty, `.` or `..` segment and no
// `.git` directory (git itself refuses these on checkout; a crafted tree object may hold them).
const isTreePath = rel =>
  !path.isAbsolute(rel) &&
  rel
    .split('/')
    .every(part => part !== '' && part !== '.' && part !== '..' && part.toLowerCase() !== '.git');

function treeEntry(line) {
  const tab = line.indexOf('\t');
  const [mode, type, object] = line.slice(0, tab).split(' ');
  const rel = line.slice(tab + 1);
  if (mode === '120000') throw new ScanError(`${rel} is a symbolic link`);
  if (mode === '160000') throw new ScanError(`${rel} is a submodule`);
  if (type !== 'blob' || !Object.hasOwn(FILE_MODES, mode))
    throw new ScanError(`${rel} has the unsupported tree mode ${mode}`);
  if (!isTreePath(rel)) throw new ScanError(`${rel} is not a plain path`);
  return { rel, object, mode: FILE_MODES[mode] };
}

// Every file entry of a revision, from its tree objects (never from a checkout).
function treeEntries(repo, sha) {
  const listed = git(repo, ['ls-tree', '-r', '-z', '--full-tree', sha]);
  if (!listed.ok) throw new ScanError(`cannot read ${sha}`);
  return listed.stdout.split('\0').filter(Boolean).map(treeEntry);
}

// The raw contents of blobs (`cat-file --batch`: no filter, conversion or attribute applies).
function blobContents(repo, objects) {
  const contents = new Map();
  for (let start = 0; start < objects.length; start += BLOB_BATCH) {
    const batch = objects.slice(start, start + BLOB_BATCH);
    const out = git(repo, ['cat-file', '--batch'], {
      encoding: 'buffer',
      input: Buffer.from(`${batch.join('\n')}\n`),
    });
    if (!out.ok) throw new ScanError('cannot read the blobs of the revision');
    let at = 0;
    for (const object of batch) {
      const eol = out.stdout.indexOf(10, at);
      const [named, type, size] = out.stdout.subarray(at, eol).toString('utf8').split(' ');
      if (named !== object || type !== 'blob') throw new ScanError(`cannot read blob ${object}`);
      const end = eol + 1 + Number(size);
      contents.set(object, out.stdout.subarray(eol + 1, end));
      at = end + 1;
    }
  }
  return contents;
}

// Writes every file of a revision into a fresh temporary directory; the caller removes it.
// From the tree objects and raw blobs (r3 B2), never through a checkout: `checkout-index` applies
// the runner's filters and the revision's attributes (a smudge driver runs a program) and writes a
// link as a plain file where links are off. Not `git archive` either: it honours the revision's
// own `export-ignore` attributes and could leave committed sources unscanned.
export function extractRevision(repo, sha) {
  const entries = treeEntries(repo, sha);
  const contents = blobContents(repo, [...new Set(entries.map(entry => entry.object))]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-mutation-head-'));
  try {
    for (const { rel, object, mode } of entries) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, contents.get(object), { flag: 'wx', mode });
    }
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error instanceof ScanError
      ? error
      : new ScanError(`cannot write the files of ${sha}: ${error.code ?? error.message}`);
  }
  return dir;
}
