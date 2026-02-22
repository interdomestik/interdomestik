#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DISALLOWED_PATTERNS = [
  { token: 'test.skip', regex: /\btest\.skip\b/ },
  { token: 'test.fixme', regex: /\btest\.fixme\b/ },
  { token: 'describe.skip', regex: /\bdescribe\.skip\b/ },
  { token: 'describe.fixme', regex: /\bdescribe\.fixme\b/ },
  { token: '@quarantine', regex: /@quarantine\b/ },
];

function printUsage() {
  console.error(
    'Usage: node scripts/release-gate/check-no-skip.mjs --manifest <path-to-required-specs.json>'
  );
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function parseArgs(argv) {
  const args = { manifest: '' };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--manifest') {
      const manifestPath = argv[index + 1];
      if (!manifestPath || manifestPath.startsWith('--')) {
        throw new Error('Missing value for --manifest');
      }
      args.manifest = manifestPath;
      index += 1;
      continue;
    }

    if (value === '--help' || value === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  if (!args.manifest) {
    throw new Error('--manifest is required');
  }

  return args;
}

function parseManifest(manifestPath) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read manifest: ${manifestPath}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Manifest is not valid JSON: ${manifestPath}`);
  }

  const specs = data?.required?.playwright?.specs;
  if (!Array.isArray(specs)) {
    throw new Error('Manifest missing required.playwright.specs array');
  }

  for (const spec of specs) {
    if (typeof spec !== 'string' || spec.trim().length === 0) {
      throw new Error('Manifest required.playwright.specs must contain non-empty string paths');
    }
  }

  return specs;
}

function findViolations(content) {
  const violations = [];
  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const pattern of DISALLOWED_PATTERNS) {
      if (pattern.regex.test(line)) {
        violations.push({ line: lineIndex + 1, token: pattern.token });
      }
    }
  }

  return violations;
}

function main() {
  const { manifest } = parseArgs(process.argv);
  const repoRoot = process.cwd();
  const manifestPath = path.resolve(repoRoot, manifest);
  const requiredSpecs = parseManifest(manifestPath);

  const missingSpecs = [];
  const tokenViolations = [];

  for (const specPath of requiredSpecs) {
    const absoluteSpecPath = path.resolve(repoRoot, specPath);
    const relativeSpecPath = normalizePath(path.relative(repoRoot, absoluteSpecPath));

    if (!fs.existsSync(absoluteSpecPath)) {
      missingSpecs.push(relativeSpecPath);
      continue;
    }

    const content = fs.readFileSync(absoluteSpecPath, 'utf8');
    const violations = findViolations(content);

    for (const violation of violations) {
      tokenViolations.push({
        file: relativeSpecPath,
        line: violation.line,
        token: violation.token,
      });
    }
  }

  for (const missingSpecPath of missingSpecs) {
    console.error(`Missing required spec: ${missingSpecPath}`);
  }

  for (const violation of tokenViolations) {
    console.error(`${violation.file}:${violation.line}: ${violation.token}`);
  }

  if (missingSpecs.length > 0 || tokenViolations.length > 0) {
    console.error(
      `Found ${tokenViolations.length} no-skip violation(s) across ${requiredSpecs.length} required spec file(s).`
    );
    process.exit(1);
  }

  console.log(
    `No skip/fixme/quarantine violations found in ${requiredSpecs.length} required spec file(s).`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(1);
}
