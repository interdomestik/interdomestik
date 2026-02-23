#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BASE_LOCALE = 'en';
const DEFAULT_LOCALES = ['sq', 'mk', 'sr'];
const DEFAULT_MESSAGES_DIR = 'apps/web/src/messages';
const DEFAULT_BASELINE_PATH = 'scripts/i18n-purity-baseline.json';
const DEFAULT_REPORT_PATH = 'tmp/i18n-purity/report.json';

function parseArgs(argv) {
  const options = {
    baseLocale: DEFAULT_BASE_LOCALE,
    locales: [...DEFAULT_LOCALES],
    messagesDir: DEFAULT_MESSAGES_DIR,
    baselinePath: DEFAULT_BASELINE_PATH,
    reportPath: DEFAULT_REPORT_PATH,
    writeBaseline: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg.startsWith('--base=')) {
      options.baseLocale = arg.slice('--base='.length).trim();
      continue;
    }

    if (arg.startsWith('--locales=')) {
      options.locales = arg
        .slice('--locales='.length)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      continue;
    }

    if (arg.startsWith('--messages-dir=')) {
      options.messagesDir = arg.slice('--messages-dir='.length).trim();
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

    if (arg === '--write-baseline') {
      options.writeBaseline = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.baseLocale) {
    throw new Error('Missing --base locale value.');
  }

  if (options.locales.length === 0) {
    throw new Error('No locales configured. Use --locales=sq,mk,sr style input.');
  }

  if (!options.locales.includes(options.baseLocale)) {
    options.locales = [options.baseLocale, ...options.locales];
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/check-i18n-purity.mjs [options]\n\nOptions:\n  --base=<locale>           Base locale (default: en)\n  --locales=<list>          Comma-separated locales (default: sq,mk,sr)\n  --messages-dir=<path>     Messages directory (default: apps/web/src/messages)\n  --baseline=<path>         Baseline file (default: scripts/i18n-purity-baseline.json)\n  --report=<path>           Output report file (default: tmp/i18n-purity/report.json)\n  --write-baseline          Write/update baseline and exit 0\n  --help, -h                Show this message\n`);
}

function flattenMessages(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [[prefix, value]] : [];
  }

  const entries = [];
  for (const key of Object.keys(value).sort()) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    entries.push(...flattenMessages(value[key], nextPrefix));
  }

  return entries;
}

function readJsonOrThrow(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function collectNamespaces(messagesDir, baseLocale) {
  const baseDir = path.join(messagesDir, baseLocale);
  if (!fs.existsSync(baseDir)) {
    throw new Error(`Base locale directory not found: ${baseDir}`);
  }

  return fs
    .readdirSync(baseDir)
    .filter(name => name.endsWith('.json'))
    .sort();
}

function collectEqualStringEntries({ messagesDir, baseLocale, locales, namespaces }) {
  const localeStats = {};
  const equalEntries = [];

  const baseByNamespace = new Map();
  for (const namespaceFile of namespaces) {
    const basePath = path.join(messagesDir, baseLocale, namespaceFile);
    const baseData = readJsonOrThrow(basePath);
    baseByNamespace.set(namespaceFile, new Map(flattenMessages(baseData)));
  }

  for (const locale of locales) {
    if (locale === baseLocale) continue;

    localeStats[locale] = {
      totalStringLeaves: 0,
      equalToBase: 0,
      exactFileCopies: 0,
      byNamespace: {},
    };

    for (const namespaceFile of namespaces) {
      const targetPath = path.join(messagesDir, locale, namespaceFile);
      if (!fs.existsSync(targetPath)) {
        throw new Error(`Missing locale namespace file: ${targetPath}`);
      }

      const basePath = path.join(messagesDir, baseLocale, namespaceFile);
      const rawBase = fs.readFileSync(basePath, 'utf8').trim();
      const rawTarget = fs.readFileSync(targetPath, 'utf8').trim();
      if (rawBase === rawTarget) {
        localeStats[locale].exactFileCopies += 1;
      }

      const targetData = readJsonOrThrow(targetPath);
      const targetMap = new Map(flattenMessages(targetData));
      const baseMap = baseByNamespace.get(namespaceFile);
      if (!baseMap) continue;

      let namespaceStringLeaves = 0;
      let namespaceEqualToBase = 0;

      for (const [keyPath, baseValue] of baseMap.entries()) {
        const targetValue = targetMap.get(keyPath);
        if (typeof baseValue !== 'string' || typeof targetValue !== 'string') {
          continue;
        }

        namespaceStringLeaves += 1;
        localeStats[locale].totalStringLeaves += 1;

        if (targetValue === baseValue) {
          namespaceEqualToBase += 1;
          localeStats[locale].equalToBase += 1;

          equalEntries.push({
            locale,
            namespace: namespaceFile,
            keyPath,
          });
        }
      }

      localeStats[locale].byNamespace[namespaceFile] = {
        totalStringLeaves: namespaceStringLeaves,
        equalToBase: namespaceEqualToBase,
      };
    }
  }

  equalEntries.sort((a, b) => {
    if (a.locale !== b.locale) return a.locale.localeCompare(b.locale);
    if (a.namespace !== b.namespace) return a.namespace.localeCompare(b.namespace);
    return a.keyPath.localeCompare(b.keyPath);
  });

  return { equalEntries, localeStats };
}

function toEntryKey(entry) {
  return `${entry.locale}:${entry.namespace}:${entry.keyPath}`;
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function summarizeTopRegressions(entries, limit = 25) {
  return entries.slice(0, limit).map(entry => `${entry.locale} ${entry.namespace} -> ${entry.keyPath}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const messagesDir = path.resolve(cwd, options.messagesDir);
  const baselinePath = path.resolve(cwd, options.baselinePath);
  const reportPath = path.resolve(cwd, options.reportPath);

  const namespaces = collectNamespaces(messagesDir, options.baseLocale);
  const { equalEntries, localeStats } = collectEqualStringEntries({
    messagesDir,
    baseLocale: options.baseLocale,
    locales: options.locales,
    namespaces,
  });

  const currentKeys = new Set(equalEntries.map(toEntryKey));

  if (options.writeBaseline) {
    const baseline = {
      version: 1,
      generatedAt: new Date().toISOString(),
      baseLocale: options.baseLocale,
      locales: options.locales.filter(locale => locale !== options.baseLocale),
      namespaces,
      equalStringEntries: [...currentKeys].sort(),
    };

    ensureDirForFile(baselinePath);
    fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');

    console.log(`Wrote i18n purity baseline: ${path.relative(cwd, baselinePath)}`);
    console.log(`Equal-to-base entries captured: ${baseline.equalStringEntries.length}`);
    return;
  }

  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      `Baseline file not found: ${path.relative(cwd, baselinePath)}. Run with --write-baseline first.`
    );
  }

  const baseline = readJsonOrThrow(baselinePath);
  if (!Array.isArray(baseline.equalStringEntries)) {
    throw new Error(`Invalid baseline format in ${path.relative(cwd, baselinePath)}.`);
  }

  const baselineKeys = new Set(
    baseline.equalStringEntries
      .map(value => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
  );

  const regressions = [];
  for (const entry of equalEntries) {
    const key = toEntryKey(entry);
    if (!baselineKeys.has(key)) {
      regressions.push(entry);
    }
  }

  const resolved = [];
  for (const key of baselineKeys) {
    if (!currentKeys.has(key)) {
      const [locale, namespace, ...rest] = key.split(':');
      resolved.push({ locale, namespace, keyPath: rest.join(':') });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'check',
    baseLocale: options.baseLocale,
    locales: options.locales.filter(locale => locale !== options.baseLocale),
    baselinePath: path.relative(cwd, baselinePath),
    metrics: {
      baselineEqualStringEntries: baselineKeys.size,
      currentEqualStringEntries: currentKeys.size,
      regressionCount: regressions.length,
      resolvedCount: resolved.length,
      localeStats,
    },
    regressions,
    resolved,
  };

  ensureDirForFile(reportPath);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const relativeReportPath = path.relative(cwd, reportPath);

  if (regressions.length > 0) {
    console.error(`i18n purity regression detected: ${regressions.length} new mixed-language entries.`);
    console.error(`Report: ${relativeReportPath}`);

    for (const line of summarizeTopRegressions(regressions)) {
      console.error(` - ${line}`);
    }

    if (process.env.CI === 'true') {
      console.error(`::error title=i18n-purity-regression::Detected ${regressions.length} new mixed-language entries. See ${relativeReportPath}`);
    }

    process.exit(1);
  }

  console.log(
    `i18n purity non-regression passed. Current equal-to-base entries: ${currentKeys.size}. Resolved since baseline: ${resolved.length}.`
  );
  console.log(`Report: ${relativeReportPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
