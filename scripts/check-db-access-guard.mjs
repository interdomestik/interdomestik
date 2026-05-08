#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BASELINE_PATH = 'scripts/ci/db-access-baseline.json';
const DEFAULT_REPORT_PATH = 'tmp/db-access-guard/report.json';
const DEFAULT_SCAN_ROOTS = ['apps/web/src', 'packages'];
const DIRECT_DB_METHODS = [
  'query',
  'select',
  'insert',
  'update',
  'delete',
  'execute',
  'transaction',
];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);

const APPROVED_WRAPPER_PATTERNS = [/^packages\/database\//u];
const EXPLICIT_CLASSIFICATION_RISKS = new Set(['server-action', 'high-risk-route']);
const EXPLICIT_CLASSIFICATION_PATH_PATTERNS = [
  /^apps\/web\/src\/features\/agent\/activation\/server\/activate-agent-profile\.ts$/u,
  /^apps\/web\/src\/features\/agent\/leads\/server\/lead-actions\.ts$/u,
  /^apps\/web\/src\/features\/claims\/upload\/server\/access\.ts$/u,
  /^apps\/web\/src\/lib\/auth\/tenant-lookup\.ts$/u,
];

const EXCLUDED_PATH_PATTERNS = [
  /(^|\/)__tests__(\/|$)/u,
  /(^|\/)(node_modules|dist|build|coverage|test-results|\.next|\.turbo)(\/|$)/u,
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
  return APPROVED_WRAPPER_PATTERNS.some(pattern => pattern.test(relativePath));
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

function stripCommentsAndStrings(source) {
  let output = '';
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (!quote && char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        output += ' ';
        index += 1;
      }
      if (index < source.length) output += '\n';
      continue;
    }

    if (!quote && char === '/' && next === '*') {
      output += '  ';
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        output += source[index] === '\n' ? '\n' : ' ';
        index += 1;
      }
      if (index < source.length) {
        output += '  ';
        index += 1;
      }
      continue;
    }

    if (quote) {
      output += char === '\n' ? '\n' : ' ';
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      output += ' ';
      continue;
    }

    output += char;
  }

  return output;
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

function hasExplicitClassification(entry) {
  return typeof entry.classification === 'string' && entry.classification.trim().length > 0;
}

function findUnclassifiedRiskyBaselineEntries(entries) {
  return entries.filter(
    entry => requiresExplicitClassification(entry) && !hasExplicitClassification(entry)
  );
}

function requiresExplicitClassification(entry) {
  return (
    EXPLICIT_CLASSIFICATION_RISKS.has(entry.risk) ||
    EXPLICIT_CLASSIFICATION_PATH_PATTERNS.some(pattern => pattern.test(entry.file))
  );
}

function classifyRisk(relativePath) {
  if (/^packages\/domain-[^/]+\/src\//u.test(relativePath)) return 'domain-wrapper';
  if (/\/route\.[cm]?[jt]sx?$/u.test(relativePath)) return 'high-risk-route';
  if (/\/page\.[cm]?[jt]sx?$/u.test(relativePath)) return 'page-entry';
  if (/\/layout\.[cm]?[jt]sx?$/u.test(relativePath)) return 'layout-entry';
  if (/\/actions\.[cm]?[jt]sx?$/u.test(relativePath)) return 'server-action';
  return 'app-layer';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function collectImportedDbAliases(searchableSource) {
  const aliases = new Set(['db']);
  const importPattern = /\bimport\s*\{([^}]*)\}/gu;

  for (const match of searchableSource.matchAll(importPattern)) {
    for (const specifier of match[1].split(',')) {
      const dbImportMatch = specifier.trim().match(/^db(?:\s+as\s+([A-Za-z_$][\w$]*))?$/u);
      if (dbImportMatch) {
        aliases.add(dbImportMatch[1] ?? 'db');
      }
    }
  }

  return aliases;
}

function collectAssignedDbAliases(searchableSource, aliases) {
  let changed = true;

  while (changed) {
    changed = false;
    const aliasPattern = [...aliases].map(escapeRegExp).join('|');
    const assignmentPattern = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]+)?=\\s*(?:${aliasPattern})\\b`,
      'gu'
    );

    for (const match of searchableSource.matchAll(assignmentPattern)) {
      if (!aliases.has(match[1])) {
        aliases.add(match[1]);
        changed = true;
      }
    }
  }
}

function collectTransactionAliases(searchableSource, aliases) {
  const aliasPattern = [...aliases].map(escapeRegExp).join('|');
  const transactionAliasPattern = new RegExp(
    `\\b(?:${aliasPattern})\\s*\\.\\s*transaction\\s*\\(\\s*(?:async\\s*)?\\(?\\s*([A-Za-z_$][\\w$]*)`,
    'gu'
  );

  for (const match of searchableSource.matchAll(transactionAliasPattern)) {
    aliases.add(match[1]);
  }
}

function collectDbAliases(searchableSource) {
  const aliases = collectImportedDbAliases(searchableSource);
  collectAssignedDbAliases(searchableSource, aliases);
  collectTransactionAliases(searchableSource, aliases);
  return [...aliases];
}

function collectFindings({ repoRoot, scanRoots }) {
  const files = scanRoots.flatMap(root => walkFiles(path.resolve(repoRoot, root), repoRoot));
  const findings = [];

  for (const filePath of files.sort()) {
    const relativePath = toPosixRelative(filePath, repoRoot);
    if (isApprovedWrapperPath(relativePath)) continue;

    const source = fs.readFileSync(filePath, 'utf8');
    const searchableSource = stripCommentsAndStrings(source);
    const lines = source.split(/\r?\n/u);
    const lineStarts = createLineStarts(searchableSource);
    const dbAliases = collectDbAliases(searchableSource).map(escapeRegExp).join('|');
    const methodPattern = new RegExp(
      `\\b(?:${dbAliases})\\s*\\.\\s*(${DIRECT_DB_METHODS.join('|')})\\b`,
      'gu'
    );

    for (const match of searchableSource.matchAll(methodPattern)) {
      if (isTypeOnlyReference(searchableSource, match.index)) continue;

      const method = match[1];
      const startLine = lineNumberForIndex(lineStarts, match.index);
      const endLine = lineNumberForIndex(lineStarts, match.index + match[0].length);
      findings.push({
        file: relativePath,
        line: startLine,
        method,
        risk: classifyRisk(relativePath),
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

function createClassificationLookup(entries) {
  const lookup = new Map();
  for (const entry of entries) {
    if (hasExplicitClassification(entry)) {
      lookup.set(createEntryKey(entry), entry.classification);
    }
  }
  return lookup;
}

function buildBaseline({ entries, scanRoots, existingEntries = [] }) {
  const classificationLookup = createClassificationLookup(existingEntries);
  const classifiedEntries = entries.map(entry => {
    const classification = classificationLookup.get(createEntryKey(entry));
    return classification ? { ...entry, classification } : entry;
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    policy:
      'Baseline for direct db.* calls outside approved database package internals. New app-layer and domain-package direct database access must move behind an approved wrapper or intentionally update this baseline.',
    scanRoots,
    approvedWrapperPatterns: APPROVED_WRAPPER_PATTERNS.map(pattern => pattern.source),
    methods: DIRECT_DB_METHODS,
    entries: classifiedEntries,
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
    console.log(`- ${entry.file}:${entry.line} ${entry.method} [${entry.risk}] ${entry.source}`);
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
    const existingEntries = fs.existsSync(baselinePath)
      ? (readJson(baselinePath).entries ?? [])
      : [];
    ensureDirForFile(baselinePath);
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(
        buildBaseline({ entries: findings, existingEntries, scanRoots: options.scanRoots }),
        null,
        2
      )}\n`
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

  const unclassifiedRiskyBaselineEntries = findUnclassifiedRiskyBaselineEntries(baseline.entries);
  const { newEntries, removedEntries } = diffAgainstBaseline(findings, baseline.entries);
  const report = {
    status:
      newEntries.length === 0 && unclassifiedRiskyBaselineEntries.length === 0 ? 'pass' : 'fail',
    baselinePath: options.baselinePath,
    scannedCount: findings.length,
    baselineCount: baseline.entries.length,
    newCount: newEntries.length,
    removedCount: removedEntries.length,
    unclassifiedRiskyBaselineCount: unclassifiedRiskyBaselineEntries.length,
    newEntries,
    removedEntries,
    unclassifiedRiskyBaselineEntries,
  };

  writeReport(reportPath, report);

  if (unclassifiedRiskyBaselineEntries.length > 0) {
    console.error(
      'DB access guard failed: risky server-action/high-risk-route entries and extracted boundary wrapper paths require explicit classification.'
    );
    printEntries('Unclassified risky baseline entries:', unclassifiedRiskyBaselineEntries);
    console.error('');
    console.error(
      'Move the access behind an approved domain/database wrapper, or add classification metadata only after focused authorization review.'
    );
    console.error(`Report: ${options.reportPath}`);
    process.exit(1);
  }

  if (newEntries.length > 0) {
    console.error(
      'DB access guard failed: new direct db.* calls were added outside approved wrappers.'
    );
    printEntries('New direct DB access:', newEntries);
    console.error('');
    console.error(
      'Move the access behind an approved domain/database wrapper, or update the baseline only with an intentional review.'
    );
    console.error(`Report: ${options.reportPath}`);
    process.exit(1);
  }

  console.log(`DB access guard passed: ${findings.length} current entries match the baseline.`);
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
