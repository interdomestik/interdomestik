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

// Writes every file of a revision into a fresh temporary directory; the caller removes it.
// Through a private index and checkout-index, not `git archive`: an archive honours the
// revision's own `export-ignore` attributes and could leave committed sources unscanned.
export function extractRevision(repo, sha) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-mutation-head-'));
  const indexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-mutation-index-'));
  const env = { GIT_INDEX_FILE: path.join(indexDir, 'index') };
  try {
    if (!git(repo, ['read-tree', sha], { env }).ok) throw new ScanError(`cannot read ${sha}`);
    const out = git(repo, ['checkout-index', '--all', '--force', `--prefix=${dir}/`], { env });
    if (!out.ok) throw new ScanError(`cannot write the files of ${sha}`);
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  } finally {
    fs.rmSync(indexDir, { recursive: true, force: true });
  }
  return dir;
}
