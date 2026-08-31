import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const GIT_BIN = '/usr/bin/git';
const SAFE_EXEC_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
const SHA40 = /^[0-9a-f]{40}$/u;

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function git(args) {
  return execFileSync(GIT_BIN, args, {
    encoding: 'utf8',
    env: SAFE_EXEC_ENV,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
}

export function resolveProtectedBase() {
  const explicit = process.env.REVIEW_PROTECTED_BASE_SHA;
  if (explicit !== undefined) {
    if (!SHA40.test(explicit)) throw new Error('REVIEW_PROTECTED_BASE_SHA is invalid');
    const resolved = git(['rev-parse', '--verify', `${explicit}^{commit}`]).trim();
    if (resolved !== explicit) throw new Error('explicit protected base does not resolve exactly');
    return explicit;
  }
  const base = git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']).trim();
  if (!SHA40.test(base)) throw new Error('exact protected base is unavailable');
  return base;
}

function parseNameStatusZ(value) {
  const tokens = value.split('\0');
  if (tokens.at(-1) === '') tokens.pop();
  const files = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!/^[ACDMRTUXB]\d*$/u.test(status)) throw new Error('git name-status output is invalid');
    const first = tokens[index++];
    if (!first) throw new Error('git name-status path is missing');
    files.push(first);
    if (/^[RC]/u.test(status)) {
      const second = tokens[index++];
      if (!second) throw new Error('git rename/copy destination is missing');
      files.push(second);
    }
  }
  return files;
}

function diffFiles(args) {
  return parseNameStatusZ(
    git(['diff', '--name-status', '-z', '--find-renames', '--diff-filter=ACDMRTUXB', ...args])
  );
}

export function changedFiles(explicitFiles) {
  if (explicitFiles.length > 0) return [...new Set(explicitFiles)].sort(compareText);
  const base = resolveProtectedBase();
  const files = new Set([
    ...diffFiles([`${base}...HEAD`]),
    ...diffFiles(['--cached']),
    ...diffFiles([]),
  ]);
  const untracked = git(['ls-files', '-z', '--others', '--exclude-standard']).split('\0');
  for (const file of untracked) if (file) files.add(file);
  return [...files].sort(compareText);
}

function diffAddedLines(diff) {
  const lines = [];
  let newLine = 0;
  for (const line of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
    if (hunk) newLine = Number(hunk[1]);
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({ line: newLine, text: line.slice(1) });
      newLine += 1;
    } else if (!line.startsWith('-') && newLine > 0) newLine += 1;
  }
  return lines;
}

export function changedLineRecords(file) {
  const base = resolveProtectedBase();
  const records = [
    git(['diff', '--unified=0', '--no-ext-diff', `${base}...HEAD`, '--', file]),
    git(['diff', '--unified=0', '--no-ext-diff', '--cached', '--', file]),
    git(['diff', '--unified=0', '--no-ext-diff', '--', file]),
  ].flatMap(diffAddedLines);
  const untracked = git(['ls-files', '-z', '--others', '--exclude-standard', '--', file]);
  if (untracked === `${file}\0` && fs.existsSync(file)) {
    records.push(
      ...fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((text, index) => ({ line: index + 1, text }))
    );
  }
  return records;
}
