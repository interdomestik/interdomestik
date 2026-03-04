#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_TAXONOMY_PATH = path.join('scripts', 'plan-conformance', 'boundary-taxonomy.json');
const DEFAULT_MANIFEST_PATH = path.join('scripts', 'release-gate', 'v1-required-specs.json');
const REQUIRED_CANONICAL_ROUTES = ['/member', '/agent', '/staff', '/admin'];
const REQUIRED_CLARITY_MARKERS = ['page-ready', 'staff-page-ready', 'admin-page-ready'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function validateRepoRelative(patterns, errors, label) {
  for (const pattern of patterns) {
    if (!pattern || pattern.startsWith('/')) {
      errors.push(`${label} must contain repo-relative paths only`);
      return;
    }

    if (pattern.includes('..')) {
      errors.push(`${label} must not contain parent traversal segments`);
      return;
    }
  }
}

export function validateBoundaryTaxonomy({ taxonomy, manifest }) {
  const errors = [];

  if (!taxonomy || typeof taxonomy !== 'object') {
    return { ok: false, errors: ['taxonomy must be an object'] };
  }

  const canonicalRoutes = taxonomy.canonical_routes;
  const noTouchPatterns = taxonomy.no_touch_patterns;
  const protectedPatterns = taxonomy.protected_patterns;
  const advisoryWatchPatterns = taxonomy.advisory_watch_patterns;
  const clarityMarkers = taxonomy.clarity_markers;

  if (!isStringArray(canonicalRoutes)) {
    errors.push('canonical_routes must be a string array');
  }

  if (!isStringArray(noTouchPatterns) || noTouchPatterns.length === 0) {
    errors.push('no_touch_patterns must be a non-empty string array');
  }

  if (!isStringArray(protectedPatterns) || protectedPatterns.length === 0) {
    errors.push('protected_patterns must be a non-empty string array');
  }

  if (!isStringArray(advisoryWatchPatterns) || advisoryWatchPatterns.length === 0) {
    errors.push('advisory_watch_patterns must be a non-empty string array');
  }

  if (!isStringArray(clarityMarkers) || clarityMarkers.length === 0) {
    errors.push('clarity_markers must be a non-empty string array');
  }

  if (isStringArray(canonicalRoutes)) {
    const missingRoutes = REQUIRED_CANONICAL_ROUTES.filter(route => !canonicalRoutes.includes(route));
    if (missingRoutes.length > 0) {
      errors.push(`canonical_routes missing required entries: ${missingRoutes.join(', ')}`);
    }
  }

  if (isStringArray(clarityMarkers)) {
    const missingMarkers = REQUIRED_CLARITY_MARKERS.filter(marker => !clarityMarkers.includes(marker));
    if (missingMarkers.length > 0) {
      errors.push(`clarity_markers missing required entries: ${missingMarkers.join(', ')}`);
    }
  }

  if (isStringArray(noTouchPatterns)) {
    validateRepoRelative(noTouchPatterns, errors, 'no_touch_patterns');
  }

  if (isStringArray(protectedPatterns)) {
    validateRepoRelative(protectedPatterns, errors, 'protected_patterns');
  }

  if (isStringArray(advisoryWatchPatterns)) {
    validateRepoRelative(advisoryWatchPatterns, errors, 'advisory_watch_patterns');
  }

  const manifestNoTouch = manifest?.no_touch_zones;
  if (!isStringArray(manifestNoTouch) || manifestNoTouch.length === 0) {
    errors.push('manifest no_touch_zones must be a non-empty string array');
  } else if (isStringArray(noTouchPatterns)) {
    const taxonomyNoTouch = uniqueSorted(noTouchPatterns);
    const requiredNoTouch = uniqueSorted(manifestNoTouch);

    if (taxonomyNoTouch.length !== requiredNoTouch.length) {
      errors.push('no_touch_patterns must exactly match release-gate manifest no_touch_zones');
    } else {
      for (let index = 0; index < taxonomyNoTouch.length; index += 1) {
        if (taxonomyNoTouch[index] !== requiredNoTouch[index]) {
          errors.push('no_touch_patterns must exactly match release-gate manifest no_touch_zones');
          break;
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function printUsage() {
  console.log(
    'boundary-taxonomy-validate\\n\\nUsage:\\n  node scripts/plan-conformance/boundary-taxonomy-validate.mjs [--taxonomy <path>] [--manifest <path>] [--report <path>]'
  );
}

function parseArgs(argv) {
  const args = {
    taxonomyPath: DEFAULT_TAXONOMY_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    reportPath: '',
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

    if (token === '--manifest' && next) {
      args.manifestPath = next;
      index += 1;
      continue;
    }

    if (token === '--report' && next) {
      args.reportPath = next;
      index += 1;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.help = true;
    }
  }

  return args;
}

function writeReport(reportPath, payload) {
  const absolutePath = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const taxonomy = readJson(args.taxonomyPath);
  const manifest = readJson(args.manifestPath);
  const result = validateBoundaryTaxonomy({ taxonomy, manifest });

  const payload = {
    taxonomy: path.resolve(args.taxonomyPath),
    manifest: path.resolve(args.manifestPath),
    validated_at: new Date().toISOString(),
    ...result,
  };

  if (args.reportPath) {
    writeReport(args.reportPath, payload);
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.ok) {
    process.exitCode = 1;
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[boundary-taxonomy-validate] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
