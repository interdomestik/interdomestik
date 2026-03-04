#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_TAXONOMY_PATH = path.join('scripts', 'plan-conformance', 'boundary-taxonomy.json');
const DEFAULT_OUT_PATH = path.join('tmp', 'plan-conformance', 'boundary-diff-report.json');
const DEFAULT_BASE_REF = 'HEAD~1';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizePaths(paths) {
  return [...new Set(paths.map(file => String(file || '').trim()).filter(Boolean))].sort();
}

function escapeRegexChar(char) {
  if (/[-/\\^$*+?.()|[\]{}]/.test(char)) {
    return `\\${char}`;
  }
  return char;
}

function globToRegExp(pattern) {
  const normalized = String(pattern || '').split(path.sep).join('/');
  let out = '^';

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '*' && next === '*') {
      out += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      out += '[^/]*';
      continue;
    }

    out += escapeRegexChar(char);
  }

  out += '$';
  return new RegExp(out);
}

function matchesAnyPattern(filePath, patterns) {
  const normalized = String(filePath || '').split(path.sep).join('/');
  return patterns.some(pattern => globToRegExp(pattern).test(normalized));
}

function maybeReason(filePath) {
  if (filePath.includes('canonical-routes.ts')) {
    return 'Canonical route contract surface changed.';
  }

  if (filePath.includes('tenant')) {
    return 'Tenant isolation related surface changed.';
  }

  if (filePath.includes('proxy')) {
    return 'Routing/authorization boundary surface changed.';
  }

  return '';
}

export function classifyBoundaryFile(filePath, taxonomy) {
  const noTouch = Array.isArray(taxonomy?.no_touch_patterns) ? taxonomy.no_touch_patterns : [];
  const protectedPatterns = Array.isArray(taxonomy?.protected_patterns)
    ? taxonomy.protected_patterns
    : [];
  const advisoryPatterns = Array.isArray(taxonomy?.advisory_watch_patterns)
    ? taxonomy.advisory_watch_patterns
    : [];

  if (matchesAnyPattern(filePath, noTouch)) {
    return {
      file: filePath,
      classification: 'no_touch',
      severity: 'critical',
      reason: maybeReason(filePath) || 'File is in Phase C no-touch zone.',
    };
  }

  if (matchesAnyPattern(filePath, protectedPatterns)) {
    return {
      file: filePath,
      classification: 'protected_boundary',
      severity: 'high',
      reason: maybeReason(filePath) || 'File is in protected boundary taxonomy.',
    };
  }

  if (matchesAnyPattern(filePath, advisoryPatterns)) {
    return {
      file: filePath,
      classification: 'advisory_watch',
      severity: 'medium',
      reason: maybeReason(filePath) || 'File is in advisory watch taxonomy.',
    };
  }

  return {
    file: filePath,
    classification: 'unclassified',
    severity: 'low',
    reason: 'No boundary taxonomy match.',
  };
}

export function buildBoundaryDiffReport({ changedFiles, taxonomy }) {
  const normalized = normalizePaths(changedFiles);
  const findings = normalized.map(file => classifyBoundaryFile(file, taxonomy));

  const summary = {
    total_files: findings.length,
    no_touch_touched: findings.filter(item => item.classification === 'no_touch').length,
    protected_touched: findings.filter(item => item.classification === 'protected_boundary').length,
    advisory_watch_touched: findings.filter(item => item.classification === 'advisory_watch').length,
    unclassified: findings.filter(item => item.classification === 'unclassified').length,
  };

  const noGo = summary.no_touch_touched > 0;
  const recommendedDecision = noGo
    ? 'rollback'
    : summary.protected_touched > 0
      ? 'pause'
      : 'continue';

  return {
    version: '1.0.0',
    mode: 'advisory',
    generated_at: new Date().toISOString(),
    no_go: noGo,
    recommended_decision: recommendedDecision,
    summary,
    findings,
  };
}

function readChangedListFile(filePath) {
  const payload = readJson(filePath);
  if (!Array.isArray(payload)) {
    throw new Error('changed-list file must be a JSON array of paths');
  }

  return payload;
}

function readChangedFromGit(baseRef) {
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--relative', `${baseRef}...HEAD`],
    { encoding: 'utf8' }
  );

  return output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function printUsage() {
  console.log(
    'boundary-diff-report\\n\\nUsage:\\n  node scripts/plan-conformance/boundary-diff-report.mjs [--taxonomy <path>] [--changed-list <json>] [--changed <path>]... [--base <git-ref>] [--out <path>]'
  );
}

function parseArgs(argv) {
  const args = {
    taxonomyPath: DEFAULT_TAXONOMY_PATH,
    changedListPath: '',
    changed: [],
    baseRef: DEFAULT_BASE_REF,
    outPath: DEFAULT_OUT_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--taxonomy' && next) {
      args.taxonomyPath = next;
      index += 1;
      continue;
    }

    if (token === '--changed-list' && next) {
      args.changedListPath = next;
      index += 1;
      continue;
    }

    if (token === '--changed' && next) {
      args.changed.push(next);
      index += 1;
      continue;
    }

    if (token === '--base' && next) {
      args.baseRef = next;
      index += 1;
      continue;
    }

    if (token === '--out' && next) {
      args.outPath = next;
      index += 1;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.help = true;
    }
  }

  return args;
}

function resolveChangedFiles(args) {
  if (args.changed.length > 0) {
    return args.changed;
  }

  if (args.changedListPath) {
    return readChangedListFile(args.changedListPath);
  }

  return readChangedFromGit(args.baseRef);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const taxonomy = readJson(args.taxonomyPath);
  const changedFiles = resolveChangedFiles(args);
  const report = buildBoundaryDiffReport({ changedFiles, taxonomy });

  writeJson(args.outPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[boundary-diff-report] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
