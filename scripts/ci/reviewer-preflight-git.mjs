import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const GIT_BIN = '/usr/bin/git';
const SAFE_EXEC_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

function git(args) {
  return execFileSync(GIT_BIN, args, {
    encoding: 'utf8',
    env: SAFE_EXEC_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return '';
  }
}

function resolveMergeBase() {
  for (const candidate of ['origin/main', 'origin/master']) {
    try {
      git(['rev-parse', '--verify', candidate]);
      return candidate;
    } catch {
      // Try the next conventional base branch.
    }
  }
  return 'HEAD~1';
}

export function changedFiles(explicitFiles) {
  if (explicitFiles.length > 0) return explicitFiles;
  const base = resolveMergeBase();
  const files = new Set();
  const diffs = [
    tryGit(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]),
    tryGit(['diff', '--name-only', '--diff-filter=ACMR', '--cached']),
    tryGit(['diff', '--name-only', '--diff-filter=ACMR']),
    tryGit(['ls-files', '--others', '--exclude-standard']),
  ];
  for (const diff of diffs) {
    for (const file of diff.split('\n')) if (file.trim()) files.add(file.trim());
  }
  return [...files].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function diffAddedLines(diff) {
  const lines = [];
  let newLine = 0;
  for (const line of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({ line: newLine, text: line.slice(1) });
      newLine += 1;
    } else if (!line.startsWith('-') && newLine > 0) {
      newLine += 1;
    }
  }
  return lines;
}

export function changedLineRecords(file) {
  const base = resolveMergeBase();
  const records = [
    tryGit(['diff', '--unified=0', '--no-ext-diff', `${base}...HEAD`, '--', file]),
    tryGit(['diff', '--unified=0', '--no-ext-diff', '--cached', '--', file]),
    tryGit(['diff', '--unified=0', '--no-ext-diff', '--', file]),
  ].flatMap(diffAddedLines);
  const untracked = tryGit(['ls-files', '--others', '--exclude-standard', '--', file]);
  if (untracked.trim() === file && fs.existsSync(file)) {
    records.push(
      ...fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((text, index) => ({
          line: index + 1,
          text,
        }))
    );
  }
  return records;
}
