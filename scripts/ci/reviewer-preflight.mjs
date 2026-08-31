import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { changedFiles, changedLineRecords } from './reviewer-preflight-git.mjs';

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
const HARNESS_SCRIPT_PATTERN = /^scripts\/.*\.[cm]?js$/u;
const HARNESS_HAZARDS = [
  {
    pattern: /\?[^:\n]+:[^?\n]+\?[^:\n]+:/u,
    message: 'contains a nested ternary; extract the decision into explicit branches.',
  },
  {
    pattern: /['"]\/private\/tmp\//u,
    message: 'uses a publicly writable temporary root for a trusted artifact.',
  },
  {
    pattern: /\.sort\([^)]*\)\s*\.\w+/u,
    message: 'chains from mutating sort; copy or use toSorted before selection.',
  },
  {
    pattern: /\b(?:execFileSync|spawnSync)\(\s*['"][^/]/u,
    message: 'launches a command without an absolute executable path.',
  },
];

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

function recordsForFile(file, inspectWholeFile) {
  if (!inspectWholeFile) return changedLineRecords(file);
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((text, index) => ({ line: index + 1, text }));
}

function inspectHarnessScript(file, findings, inspectWholeFile) {
  if (
    !HARNESS_SCRIPT_PATTERN.test(file) ||
    TEST_OR_CONFIG_PATTERN.test(file) ||
    file === 'scripts/ci/reviewer-preflight.mjs' ||
    !fs.existsSync(file)
  ) {
    return;
  }
  const records = recordsForFile(file, inspectWholeFile);
  const content = records.map(record => record.text).join('\n');
  for (const hazard of HARNESS_HAZARDS) {
    const match = hazard.pattern.exec(content);
    if (match) {
      addFinding(findings, file, hazard.message, lineForRecordsOffset(records, match.index));
    }
  }
}

function inspectFile(file, findings, warnings, inspectWholeFile) {
  if (PROTECTED_PATHS.has(file)) {
    addFinding(findings, file, 'changes Phase C routing authority; this needs explicit review.', 1);
  }
  inspectSensitivePath(file, warnings);
  inspectDeploymentConfig(file, findings);
  inspectHarnessScript(file, findings, inspectWholeFile);

  if (!isProductionAppSource(file) || !fs.existsSync(file)) {
    return;
  }

  const records = recordsForFile(file, inspectWholeFile);

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
const files = changedFiles(explicitFiles);
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
