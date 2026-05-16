import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const GIT_BIN = '/usr/bin/git';
const SAFE_EXEC_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
const PROTECTED_PATHS = new Set(['apps/web/src/proxy.ts']);
const SENSITIVE_PATH_PATTERNS = [
  /^apps\/web\/src\/app\/api\/auth\//u,
  /^apps\/web\/src\/lib\/auth/u,
  /^packages\/shared-auth\//u,
  /^packages\/database\/src\/.*tenant/u,
  /^packages\/database\/src\/.*rls/u,
];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const TEST_OR_CONFIG_PATTERN =
  /(\.test\.|\.spec\.|playwright\.config\.|next\.config\.|instrumentation\.)/u;
const LOCAL_URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/u;
const EMPTY_CATCH_PATTERN = /catch\s*(?:\([^)]*\)\s*)?\{\s*\}/u;
const ENV_OR_FALLBACK_PATTERN = /process\.env\.[A-Z0-9_]+\s*\|\|\s*['"`]/u;
const TEST_ONLY_VALUE_PATTERN =
  /(test-secret-for-(?:ci|local)|dummy-token|NEXT_PUBLIC_BILLING_TEST_MODE\s*[:=]\s*['"]?1)/u;
const ENV_ESCAPE_PATTERN = /\$[A-Z][A-Z0-9_]*|\$\{[A-Z][A-Z0-9_]*\}|process\.env\.[A-Z0-9_]+/u;

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

function diffAddedLines(diff) {
  const lines = [];
  let newLine = 0;

  for (const line of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (line.startsWith('+++')) {
      continue;
    }

    if (line.startsWith('+')) {
      lines.push({ line: newLine, text: line.slice(1) });
      newLine += 1;
      continue;
    }

    if (line.startsWith('-')) {
      continue;
    }

    if (newLine > 0) {
      newLine += 1;
    }
  }

  return lines;
}

function changedLineRecords(file) {
  const records = [];
  const base = resolveMergeBase();
  const diffs = [
    tryGit(['diff', '--unified=0', '--no-ext-diff', `${base}...HEAD`, '--', file]),
    tryGit(['diff', '--unified=0', '--no-ext-diff', '--cached', '--', file]),
    tryGit(['diff', '--unified=0', '--no-ext-diff', '--', file]),
  ];

  for (const diff of diffs) {
    records.push(...diffAddedLines(diff));
  }

  const untracked = tryGit(['ls-files', '--others', '--exclude-standard', '--', file]);
  if (untracked.trim() === file && fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    records.push(
      ...content.split('\n').map((text, index) => ({
        line: index + 1,
        text,
      }))
    );
  }

  return records;
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

function lineForRecordsOffset(records, offset) {
  let cursor = 0;

  for (const record of records) {
    const width = record.text.length + 1;
    if (offset < cursor + width) {
      return record.line;
    }
    cursor += width;
  }

  return records.at(-1)?.line ?? 1;
}

function addFinding(findings, file, message, line) {
  findings.push(line ? `${file}:${line} ${message}` : `${file} ${message}`);
}

function addWarning(warnings, file, message, line) {
  warnings.push(line ? `${file}:${line} ${message}` : `${file} ${message}`);
}

function inspectSensitivePath(file, warnings) {
  if (SENSITIVE_PATH_PATTERNS.some(pattern => pattern.test(file))) {
    addWarning(
      warnings,
      file,
      'touches auth, tenant, or RLS-sensitive code. Confirm the change is surgical and covered.',
      1
    );
  }
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function inspectDeploymentConfig(file, findings) {
  if (!fs.existsSync(file) || file !== 'apps/web/vercel.json') {
    return;
  }

  const parsed = readJsonFile(file);
  if (!parsed || typeof parsed.ignoreCommand !== 'string') {
    return;
  }

  const ignoreCommand = parsed.ignoreCommand.trim();
  if (/^exit\s+0$/u.test(ignoreCommand)) {
    addFinding(
      findings,
      file,
      'unconditionally skips Vercel builds; gate deployment pauses behind an environment variable escape hatch.',
      1
    );
    return;
  }

  if (/\bexit\s+0\b/u.test(ignoreCommand) && !ENV_ESCAPE_PATTERN.test(ignoreCommand)) {
    addFinding(
      findings,
      file,
      'skips Vercel builds without an environment variable escape hatch.',
      1
    );
  }
}

function inspectFile(file, findings, warnings, inspectWholeFile) {
  if (PROTECTED_PATHS.has(file)) {
    addFinding(findings, file, 'changes Phase C routing authority; this needs explicit review.', 1);
  }
  inspectSensitivePath(file, warnings);
  inspectDeploymentConfig(file, findings);

  if (!isProductionAppSource(file) || !fs.existsSync(file)) {
    return;
  }

  const records = inspectWholeFile
    ? fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((text, index) => ({
          line: index + 1,
          text,
        }))
    : changedLineRecords(file);

  if (records.length === 0) {
    return;
  }

  const content = records.map(record => record.text).join('\n');
  const localUrlMatch = LOCAL_URL_PATTERN.exec(content);
  if (localUrlMatch) {
    addFinding(
      findings,
      file,
      `hard-codes local URL ${localUrlMatch[0]}; derive it from runtime config or keep it in tests/config.`,
      inspectWholeFile
        ? lineForOffset(content, localUrlMatch.index)
        : lineForRecordsOffset(records, localUrlMatch.index)
    );
  }

  const emptyCatchMatch = EMPTY_CATCH_PATTERN.exec(content);
  if (emptyCatchMatch) {
    addFinding(
      findings,
      file,
      'contains an empty catch block; handle or intentionally document the error path.',
      inspectWholeFile
        ? lineForOffset(content, emptyCatchMatch.index)
        : lineForRecordsOffset(records, emptyCatchMatch.index)
    );
  }

  if (ENV_OR_FALLBACK_PATTERN.test(content)) {
    warnings.push(
      `${file} uses || fallback for an env var. Prefer ?? when empty string is a meaningful configured value.`
    );
  }

  const testOnlyValueMatch = TEST_ONLY_VALUE_PATTERN.exec(content);
  if (testOnlyValueMatch) {
    addFinding(
      findings,
      file,
      'introduces test-only configuration into production source; keep CI/dev placeholders in tests, scripts, or environment setup.',
      inspectWholeFile
        ? lineForOffset(content, testOnlyValueMatch.index)
        : lineForRecordsOffset(records, testOnlyValueMatch.index)
    );
  }
}

function hasSourceChanges(files) {
  return files.some(file => isProductionAppSource(file) || file.startsWith('packages/'));
}

function hasTestChanges(files) {
  return files.some(file => /\.(test|spec)\.[cm]?[jt]sx?$/u.test(file));
}

const explicitFiles = process.argv.slice(2);
const files = changedFiles();
const findings = [];
const warnings = [];

for (const file of files) {
  inspectFile(file, findings, warnings, explicitFiles.length > 0);
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
