#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

class CliUsageError extends Error {}

function printUsage() {
  console.error(
    'Usage: node scripts/release-gate/verify-required-specs.mjs --manifest <path> --playwright-json <path> [--junit <path>]'
  );
}

function parseArgs(argv) {
  const args = {
    manifest: '',
    playwrightJson: '',
    junit: '',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--manifest') {
      const manifestPath = argv[index + 1];
      if (!manifestPath || manifestPath.startsWith('--')) {
        throw new CliUsageError('Missing value for --manifest');
      }
      args.manifest = manifestPath;
      index += 1;
      continue;
    }

    if (value === '--playwright-json') {
      const reportPath = argv[index + 1];
      if (!reportPath || reportPath.startsWith('--')) {
        throw new CliUsageError('Missing value for --playwright-json');
      }
      args.playwrightJson = reportPath;
      index += 1;
      continue;
    }

    if (value === '--junit') {
      const junitPath = argv[index + 1];
      if (!junitPath || junitPath.startsWith('--')) {
        throw new CliUsageError('Missing value for --junit');
      }
      args.junit = junitPath;
      index += 1;
      continue;
    }

    if (value === '--help' || value === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new CliUsageError(`Unknown argument: ${value}`);
  }

  if (!args.manifest) {
    throw new CliUsageError('--manifest is required');
  }
  if (!args.playwrightJson) {
    throw new CliUsageError('--playwright-json is required');
  }

  return args;
}

function normalizePath(filePath) {
  return String(filePath || '')
    .split(path.sep)
    .join('/');
}

function resolveRepoRoot() {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), '../..');
}

function resolveFromRepoRoot(repoRoot, filePath) {
  if (path.isAbsolute(filePath)) return path.normalize(filePath);
  return path.resolve(repoRoot, filePath);
}

function readJson(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`Unable to read ${label}: ${filePath}`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function getRequiredSpecs(manifest) {
  const specs = manifest?.required?.playwright?.specs;
  if (!Array.isArray(specs)) {
    throw new Error('Manifest missing required.playwright.specs array');
  }

  return specs.map(spec => {
    if (typeof spec !== 'string' || spec.trim() === '') {
      throw new Error('Manifest required.playwright.specs must contain non-empty strings');
    }
    return normalizePath(spec);
  });
}

function collectReportSpecFiles(playwrightReport) {
  const files = new Set();

  function walkSuite(suite) {
    if (!suite || typeof suite !== 'object') return;

    if (typeof suite.file === 'string' && suite.file.length > 0) {
      files.add(normalizePath(suite.file));
    }

    if (Array.isArray(suite.specs)) {
      for (const spec of suite.specs) {
        if (spec && typeof spec.file === 'string' && spec.file.length > 0) {
          files.add(normalizePath(spec.file));
        }
      }
    }

    if (Array.isArray(suite.suites)) {
      for (const nested of suite.suites) {
        walkSuite(nested);
      }
    }
  }

  if (Array.isArray(playwrightReport?.suites)) {
    for (const suite of playwrightReport.suites) {
      walkSuite(suite);
    }
  }

  return files;
}

function fileBasename(filePath) {
  const normalized = normalizePath(filePath);
  const segments = normalized.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : normalized;
}

function buildBasenameCountMap(filePaths) {
  const counts = new Map();
  for (const filePath of filePaths) {
    const basename = fileBasename(filePath);
    counts.set(basename, (counts.get(basename) ?? 0) + 1);
  }
  return counts;
}

function hasReportMatch(requiredSpec, reportFiles, allowBasenameMatch) {
  const normalizedRequired = normalizePath(requiredSpec);
  const reportRelativeRequired = normalizedRequired.startsWith('apps/web/')
    ? normalizedRequired.slice('apps/web/'.length)
    : normalizedRequired;
  const requiredBase = fileBasename(normalizedRequired);

  for (const reportFile of reportFiles) {
    const normalizedReport = normalizePath(reportFile);
    if (
      normalizedReport === normalizedRequired ||
      normalizedReport === reportRelativeRequired
    ) {
      return true;
    }
    if (allowBasenameMatch && normalizedReport === requiredBase) {
      return true;
    }
    if (
      normalizedReport.endsWith(`/${normalizedRequired}`) ||
      normalizedReport.endsWith(`/${reportRelativeRequired}`)
    ) {
      return true;
    }
    if (allowBasenameMatch && normalizedReport.endsWith(`/${requiredBase}`)) {
      return true;
    }
  }

  return false;
}

function ensureFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
}

function ensureNonEmptyFile(filePath, label) {
  ensureFileExists(filePath, label);
  const size = fs.statSync(filePath).size;
  if (size <= 0) {
    throw new Error(`${label} is empty: ${filePath}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = resolveRepoRoot();

  const manifestPath = resolveFromRepoRoot(repoRoot, args.manifest);
  const playwrightJsonPath = resolveFromRepoRoot(repoRoot, args.playwrightJson);
  const junitPath = args.junit ? resolveFromRepoRoot(repoRoot, args.junit) : '';

  ensureFileExists(manifestPath, '--manifest');
  ensureFileExists(playwrightJsonPath, '--playwright-json');
  if (junitPath) {
    ensureNonEmptyFile(junitPath, '--junit');
  }

  const manifest = readJson(manifestPath, 'Manifest');
  const requiredSpecs = getRequiredSpecs(manifest);
  const report = readJson(playwrightJsonPath, 'Playwright JSON report');
  const reportFiles = collectReportSpecFiles(report);
  const requiredBasenameCounts = buildBasenameCountMap(requiredSpecs);

  const missing = requiredSpecs.filter(spec => {
    const basename = fileBasename(spec);
    const allowBasenameMatch = (requiredBasenameCounts.get(basename) ?? 0) === 1;
    return !hasReportMatch(spec, reportFiles, allowBasenameMatch);
  });
  if (missing.length > 0) {
    console.error('Required specs missing from Playwright report:');
    for (const filePath of missing) {
      console.error(filePath);
    }
    process.exit(1);
  }

  console.log(`Verified required specs: ${requiredSpecs.length}`);
  if (junitPath) {
    console.log(`Verified JUnit artifact: ${normalizePath(path.relative(repoRoot, junitPath))}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof CliUsageError) {
    printUsage();
  }
  process.exit(1);
}
