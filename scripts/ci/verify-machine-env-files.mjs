// Gate runs take every setting from the checked environment, so the checkout may hold no local env
// file. The gatekeeper, the build, the E2E server and package loaders each read env files their
// own way, and git cannot list them all (a nested checkout is one opaque entry), so the files on
// disk are searched directly.
import { readdirSync } from 'node:fs';
import path from 'node:path';

// `.env` or `.env.<suffix>` in any letter case (macOS volumes are case-insensitive); `.envrc` is
// not one. A plain comparison, so a name with a line break or any other character still counts.
function isLocalEnvName(name) {
  const lower = name.toLowerCase();
  return lower === '.env' || lower.startsWith('.env.');
}
// Git data and installed packages: no lane runs from inside them.
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);
const TRACKED_PATHSPECS = [':(glob,icase)**/.env', ':(glob,icase)**/.env.*'];

// Sorts one directory's entries into subdirectories to search and env files found.
function classify(relative, entries, pending, found) {
  for (const entry of entries) {
    const entryPath = relative ? `${relative}/${entry.name}` : entry.name;
    // Links are not followed; a link named like an env file still counts.
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) pending.push(entryPath);
    } else if (isLocalEnvName(entry.name)) {
      found.push(entryPath);
    }
  }
}

/** Env file names under `root`, relative to it, plus directories that could not be read. */
export function envFilesOnDisk(root, readdir = readdirSync) {
  const found = [];
  const unsearched = [];
  const pending = [''];
  while (pending.length > 0) {
    const relative = pending.pop();
    try {
      classify(
        relative,
        readdir(path.join(root, relative), { withFileTypes: true }),
        pending,
        found
      );
    } catch {
      unsearched.push(relative || '.');
    }
  }
  const byName = (a, b) => a.localeCompare(b);
  return { files: found.toSorted(byName), unsearched: unsearched.toSorted(byName) };
}

/** Env files on disk that the checkout does not track (tracked examples are fine). */
export function localEnvFiles(repoRoot, exec, readdir = readdirSync) {
  const tracked = new Set(
    exec('git', ['ls-files', '-z', '--', ...TRACKED_PATHSPECS], repoRoot).split('\0')
  );
  const { files, unsearched } = envFilesOnDisk(repoRoot, readdir);
  return { files: files.filter(file => !tracked.has(file)), unsearched };
}
