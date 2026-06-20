#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  createEmptyPostureCounts,
  createTenantPostureClassifier,
} from './ci/db-access-posture.mjs';
import { callFirstArgumentName, collectDbAliases, escapeRegExp } from './ci/db-access-aliases.mjs';
import { DIRECT_DB_METHODS } from './ci/db-access-constants.mjs';
import { isSensitiveNewEntry } from './ci/db-access-sensitive-entry.mjs';
import { stripCommentsAndStrings } from './ci/source-strip-comments.mjs';

const DEFAULT_BASELINE_PATH = 'scripts/ci/db-access-baseline.json';
const DEFAULT_REPORT_PATH = 'tmp/db-access-guard/report.json';
const DEFAULT_SCAN_ROOTS = ['apps/web/src', 'packages'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);

const APPROVED_DATABASE_INTERNAL_PATTERNS = [
  /^packages\/database\/apply-migration\.ts$/u,
  /^packages\/database\/src\/db\.ts$/u,
  /^packages\/database\/src\/member-number\.ts$/u,
  /^packages\/database\/src\/tenant\.ts$/u,
  /^packages\/database\/src\/tenant-security\.ts$/u,
  /^packages\/database\/src\/server\.ts$/u,
  /^packages\/database\/src\/verify-golden\.ts$/u,
  /^packages\/database\/src\/migrate\.ts$/u,
  /^packages\/database\/src\/seed\.ts$/u,
  /^packages\/database\/src\/seed-[^/]+\.ts$/u,
  /^packages\/database\/src\/seed-[^/]+\//u,
  /^packages\/database\/src\/scripts\//u,
  /^packages\/database\/src\/schema\.ts$/u,
  /^packages\/database\/src\/schema\//u,
];

const EXCLUDED_PATH_PATTERNS = [
  /(^|\/)__tests__(\/|$)/u,
  /(^|\/)(node_modules|dist|build|coverage|test-results|\.next|\.turbo)(\/|$)/u,
  /^apps\/web\/src\/app\/api\/e2e\//u,
  /^packages\/domain-membership-billing\/src\/paddle-webhooks\/handlers\/test-support\.[cm]?[jt]sx?$/u,
  /\.(test|spec)\.[cm]?[jt]sx?$/u,
  /\.d\.ts$/u,
];

function parseArgs(argv) {
  const options = {
    baselinePath: DEFAULT_BASELINE_PATH,
    reportPath: DEFAULT_REPORT_PATH,
    scanRoots: [...DEFAULT_SCAN_ROOTS],
    writeBaseline: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--write-baseline') {
      options.writeBaseline = true;
      continue;
    }

    if (arg.startsWith('--baseline=')) {
      options.baselinePath = arg.slice('--baseline='.length).trim();
      continue;
    }

    if (arg.startsWith('--report=')) {
      options.reportPath = arg.slice('--report='.length).trim();
      continue;
    }

    if (arg.startsWith('--roots=')) {
      options.scanRoots = arg
        .slice('--roots='.length)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.scanRoots.length === 0) {
    throw new Error('At least one scan root is required.');
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/check-db-access-guard.mjs [options]

Options:
  --baseline=<path>       Baseline file (default: ${DEFAULT_BASELINE_PATH})
  --report=<path>         Report file (default: ${DEFAULT_REPORT_PATH})
  --roots=<a,b,c>         Comma-separated roots to scan (default: ${DEFAULT_SCAN_ROOTS.join(',')})
  --write-baseline        Update the baseline from current findings and exit 0
  --help, -h              Show this message
`);
}

function toPosixRelative(filePath, repoRoot) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isExcludedPath(relativePath) {
  return EXCLUDED_PATH_PATTERNS.some(pattern => pattern.test(relativePath));
}

function isApprovedWrapperPath(relativePath) {
  return APPROVED_DATABASE_INTERNAL_PATTERNS.some(pattern => pattern.test(relativePath));
}

function walkFiles(rootDir, repoRoot, results = []) {
  if (!fs.existsSync(rootDir)) return results;

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    const relativePath = toPosixRelative(fullPath, repoRoot);

    if (isExcludedPath(relativePath)) continue;

    if (entry.isDirectory()) {
      walkFiles(fullPath, repoRoot, results);
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

function normalizeSource(source) {
  return source.trim().replace(/\s+/gu, ' ');
}

function createLineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineNumberForIndex(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = lineStarts[mid];
    const next = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;

    if (index >= current && index < next) {
      return mid + 1;
    }

    if (index < current) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return 1;
}

function sourceSnippetForMatch(lines, startLine, endLine) {
  const startIndex = Math.max(0, startLine - 1);
  const endIndex = Math.min(lines.length, Math.max(startLine, endLine));
  return normalizeSource(lines.slice(startIndex, endIndex).join(' '));
}

function isTypeOnlyReference(searchableSource, matchIndex) {
  const lineStart = searchableSource.lastIndexOf('\n', matchIndex - 1) + 1;
  const linePrefix = searchableSource.slice(lineStart, matchIndex);
  return /\btypeof\s*$/u.test(linePrefix);
}

function createEntryKey(entry) {
  return `${entry.file}|${entry.method}|${entry.source}`;
}

function classifyRisk(relativePath) {
  if (/^packages\/domain-[^/]+\/src\//u.test(relativePath)) return 'domain-wrapper';
  if (/\/route\.[cm]?[jt]sx?$/u.test(relativePath)) return 'high-risk-route';
  if (/\/page\.[cm]?[jt]sx?$/u.test(relativePath)) return 'page-entry';
  if (/\/layout\.[cm]?[jt]sx?$/u.test(relativePath)) return 'layout-entry';
  if (/\/actions\.[cm]?[jt]sx?$/u.test(relativePath)) return 'server-action';
  return 'app-layer';
}

function collectFindings({ repoRoot, scanRoots }) {
  const files = scanRoots.flatMap(root => walkFiles(path.resolve(repoRoot, root), repoRoot));
  const findings = [];

  for (const filePath of files.sort()) {
    const relativePath = toPosixRelative(filePath, repoRoot);
    if (isApprovedWrapperPath(relativePath)) continue;

    const source = fs.readFileSync(filePath, 'utf8');
    const searchableSource = stripCommentsAndStrings(source);
    const classifyTenantPosture = createTenantPostureClassifier(source, relativePath);
    const lines = source.split(/\r?\n/u);
    const lineStarts = createLineStarts(searchableSource);
    const aliasState = collectDbAliases(searchableSource, source, relativePath);
    const dbAliases = [...aliasState.aliases].map(escapeRegExp).join('|');
    const methodPattern = new RegExp(
      String.raw`(?<!\.)\b(${dbAliases})\s*\.\s*(${DIRECT_DB_METHODS.join('|')})\b`,
      'gu'
    );

    for (const match of searchableSource.matchAll(methodPattern)) {
      if (isTypeOnlyReference(searchableSource, match.index)) continue;

      const calleeAlias = match[1];
      const method = match[2];
      const firstArgumentName = callFirstArgumentName(
        searchableSource,
        match.index + match[0].length
      );
      const startLine = lineNumberForIndex(lineStarts, match.index);
      const endLine = lineNumberForIndex(lineStarts, match.index + match[0].length);
      const posture = classifyTenantPosture({
        matchIndex: match.index,
        calleeAlias,
        isAdminAlias: aliasState.adminAliases.has(calleeAlias),
        isRlsAlias: aliasState.rlsAliases.has(calleeAlias),
        method,
        line: startLine,
      });
      findings.push({
        file: relativePath,
        line: startLine,
        callee: `${calleeAlias}.${method}`,
        isDirectDbAlias: aliasState.directDbAliases.has(calleeAlias),
        claimsUpdateTarget:
          method === 'update' && aliasState.claimTableAliases.has(firstArgumentName),
        method,
        risk: classifyRisk(relativePath),
        ...posture,
        source: sourceSnippetForMatch(lines, startLine, endLine),
      });
    }
  }

  findings.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    if (a.method !== b.method) return a.method.localeCompare(b.method);
    return a.source.localeCompare(b.source);
  });

  return findings;
}

function countByKey(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const key = createEntryKey(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function diffAgainstBaseline(currentEntries, baselineEntries) {
  const baselineCounts = countByKey(baselineEntries);
  const seenCounts = new Map();
  const newEntries = [];

  for (const entry of currentEntries) {
    const key = createEntryKey(entry);
    const seen = (seenCounts.get(key) ?? 0) + 1;
    seenCounts.set(key, seen);

    if (seen > (baselineCounts.get(key) ?? 0)) {
      newEntries.push(entry);
    }
  }

  const currentCounts = countByKey(currentEntries);
  const removedEntries = [];
  for (const entry of baselineEntries) {
    const key = createEntryKey(entry);
    if ((currentCounts.get(key) ?? 0) < (baselineCounts.get(key) ?? 0)) {
      removedEntries.push(entry);
      baselineCounts.set(key, (baselineCounts.get(key) ?? 0) - 1);
    }
  }

  return { newEntries, removedEntries };
}

function countEntriesBy(entries, property) {
  const counts = {};
  for (const entry of entries) {
    const value = entry[property] ?? 'unknown';
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function buildCounts(entries) {
  return {
    byRisk: countEntriesBy(entries, 'risk'),
    byTenantPosture: {
      ...createEmptyPostureCounts(),
      ...countEntriesBy(entries, 'tenantPosture'),
    },
  };
}

function buildBaseline({ entries, scanRoots }) {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    policy: 'see docs/dev/db-access-guard.md',
    scanRoots,
    approvedDatabaseInternalPatterns: APPROVED_DATABASE_INTERNAL_PATTERNS.map(
      pattern => pattern.source
    ),
    methods: DIRECT_DB_METHODS,
    counts: buildCounts(entries),
    entries,
  };
}

function writeReport(reportPath, report) {
  ensureDirForFile(reportPath);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function printEntries(title, entries, limit = 25) {
  if (entries.length === 0) return;

  console.log(title);
  for (const entry of entries.slice(0, limit)) {
    console.log(
      `- ${entry.file}:${entry.line} ${entry.method} [${entry.risk}] [${entry.tenantPosture}] ${entry.source}`
    );
  }
  if (entries.length > limit) {
    console.log(`...and ${entries.length - limit} more`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const baselinePath = path.resolve(repoRoot, options.baselinePath);
  const reportPath = path.resolve(repoRoot, options.reportPath);
  const findings = collectFindings({ repoRoot, scanRoots: options.scanRoots });

  if (options.writeBaseline) {
    ensureDirForFile(baselinePath);
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(buildBaseline({ entries: findings, scanRoots: options.scanRoots }), null, 2)}\n`
    );
    console.log(`Updated DB access baseline: ${options.baselinePath} (${findings.length} entries)`);
    return;
  }

  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      `Missing baseline ${options.baselinePath}. Run node scripts/check-db-access-guard.mjs --write-baseline from the repo root.`
    );
  }

  const baseline = readJson(baselinePath);
  if (!Array.isArray(baseline.entries)) {
    throw new Error(`Invalid baseline ${options.baselinePath}: missing entries array.`);
  }

  const { newEntries, removedEntries } = diffAgainstBaseline(findings, baseline.entries);
  const failingNewEntries = newEntries.filter(isSensitiveNewEntry);
  const report = {
    status: failingNewEntries.length === 0 ? 'pass' : 'fail',
    baselinePath: options.baselinePath,
    scannedCount: findings.length,
    baselineCount: baseline.entries.length,
    counts: buildCounts(findings),
    newCount: newEntries.length,
    failingNewCount: failingNewEntries.length,
    removedCount: removedEntries.length,
    newEntries,
    failingNewEntries,
    removedEntries,
  };

  writeReport(reportPath, report);

  if (failingNewEntries.length > 0) {
    console.error('DB access guard failed: sensitive new direct DB access was added.');
    printEntries('Failing new direct DB access:', failingNewEntries);
    console.error('');
    console.error(
      [
        'Failures include unclassified access, write-only tenant-predicate access, raw dbAdmin/dbRls outside approved adapters,',
        'and db.update(claims) outside packages/domain-claims/src/claims/transition.ts.',
      ].join(' ')
    );
    console.error(
      'Claims updates are not waivable with posture directives; move them through the transition command.'
    );
    console.error(
      'Move other access behind withTenantContext/withTenantDb, add a reviewed system-exempt directive, or update the baseline only with an intentional review.'
    );
    console.error(`Report: ${options.reportPath}`);
    process.exit(1);
  }

  if (newEntries.length > 0) {
    console.log(
      `DB access guard passed: ${findings.length} current entries scanned with ${newEntries.length} non-failing new direct DB access entries.`
    );
    printEntries('Non-failing new direct DB access:', newEntries, 10);
  } else {
    console.log(`DB access guard passed: ${findings.length} current entries match the baseline.`);
  }
  console.log(
    `Posture counts: ${Object.entries(report.counts.byTenantPosture)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')}`
  );
  if (removedEntries.length > 0) {
    printEntries('Baseline entries no longer present:', removedEntries, 10);
    console.log('Consider refreshing the baseline after confirming the cleanup is intentional.');
  }
  console.log(`Report: ${options.reportPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
