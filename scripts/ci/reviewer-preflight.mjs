import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const GIT_BIN = '/usr/bin/git';
const SAFE_EXEC_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
const PROTECTED_PATHS = new Set(['apps/web/src/proxy.ts']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const TEST_OR_CONFIG_PATTERN =
  /(\.test\.|\.spec\.|playwright\.config\.|next\.config\.|instrumentation\.)/u;
const LOCAL_URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/u;
const EMPTY_CATCH_PATTERN = /catch\s*\([^)]*\)\s*\{\s*\}/u;

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

function changedFiles() {
  const explicitFiles = process.argv.slice(2);
  if (explicitFiles.length > 0) {
    return explicitFiles;
  }

  const base = resolveMergeBase();
  const files = new Set();
  const diffs = [
    tryGit(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]),
    tryGit(['diff', '--name-only', '--diff-filter=ACMR', '--cached']),
    tryGit(['diff', '--name-only', '--diff-filter=ACMR']),
    tryGit(['ls-files', '--others', '--exclude-standard']),
  ];

  for (const diff of diffs) {
    for (const file of diff.split('\n')) {
      const trimmed = file.trim();
      if (trimmed) {
        files.add(trimmed);
      }
    }
  }

  return [...files].sort((left, right) => left.localeCompare(right));
}

function isSourceFile(file) {
  return SOURCE_EXTENSIONS.has(path.extname(file));
}

function isProductionAppSource(file) {
  return (
    file.startsWith('apps/web/src/') && isSourceFile(file) && !TEST_OR_CONFIG_PATTERN.test(file)
  );
}

function lineForOffset(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

function addFinding(findings, file, message, line) {
  findings.push(line ? `${file}:${line} ${message}` : `${file} ${message}`);
}

function inspectFile(file, findings, warnings) {
  if (PROTECTED_PATHS.has(file)) {
    addFinding(findings, file, 'changes Phase C routing authority; this needs explicit review.', 1);
  }

  if (!isProductionAppSource(file) || !fs.existsSync(file)) {
    return;
  }

  const content = fs.readFileSync(file, 'utf8');
  const localUrlMatch = LOCAL_URL_PATTERN.exec(content);
  if (localUrlMatch) {
    addFinding(
      findings,
      file,
      `hard-codes local URL ${localUrlMatch[0]}; derive it from runtime config or keep it in tests/config.`,
      lineForOffset(content, localUrlMatch.index)
    );
  }

  const emptyCatchMatch = EMPTY_CATCH_PATTERN.exec(content);
  if (emptyCatchMatch) {
    addFinding(
      findings,
      file,
      'contains an empty catch block; handle or intentionally document the error path.',
      lineForOffset(content, emptyCatchMatch.index)
    );
  }

  if (/process\.env\.[A-Z0-9_]+\s*\|\|\s*['"`]/u.test(content)) {
    warnings.push(
      `${file} uses || fallback for an env var. Prefer ?? when empty string is a meaningful configured value.`
    );
  }
}

function hasSourceChanges(files) {
  return files.some(file => isProductionAppSource(file) || file.startsWith('packages/'));
}

function hasTestChanges(files) {
  return files.some(file => /\.(test|spec)\.[cm]?[jt]sx?$/u.test(file));
}

const files = changedFiles();
const findings = [];
const warnings = [];

for (const file of files) {
  inspectFile(file, findings, warnings);
}

if (hasSourceChanges(files) && !hasTestChanges(files)) {
  warnings.push(
    'Production source changed without a changed test file. Confirm coverage before opening PR.'
  );
}

for (const warning of warnings) {
  console.warn(`review-preflight warning: ${warning}`);
}

if (findings.length > 0) {
  console.error('review-preflight failed: likely PR review comments detected.');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('review-preflight passed.');
