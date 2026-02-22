#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DISALLOWED_PATTERNS = [
  { token: 'test.skip', hasLeadingWordBoundary: true, hasTrailingWordBoundary: true },
  { token: 'test.fixme', hasLeadingWordBoundary: true, hasTrailingWordBoundary: true },
  { token: 'describe.skip', hasLeadingWordBoundary: true, hasTrailingWordBoundary: true },
  { token: 'describe.fixme', hasLeadingWordBoundary: true, hasTrailingWordBoundary: true },
  { token: '@quarantine', hasLeadingWordBoundary: false, hasTrailingWordBoundary: true },
];

function printUsage() {
  console.error(
    'Usage: node scripts/release-gate/check-no-skip.mjs --manifest <path-to-required-specs.json>'
  );
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

class CliUsageError extends Error {}

function isWordChar(char) {
  return /[A-Za-z0-9_]/.test(char);
}

function hasWordBoundaryBefore(content, index) {
  if (index <= 0) {
    return true;
  }

  return !isWordChar(content[index - 1]);
}

function hasWordBoundaryAfter(content, index) {
  if (index >= content.length) {
    return true;
  }

  return !isWordChar(content[index]);
}

function parseArgs(argv) {
  const args = { manifest: '' };

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

    if (value === '--help' || value === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new CliUsageError(`Unknown argument: ${value}`);
  }

  if (!args.manifest) {
    throw new CliUsageError('--manifest is required');
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
  let line = 1;
  let inSingleLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let stringDelimiter = '';
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1] ?? '';

    if (inSingleLineComment) {
      if (char === '\n') {
        line += 1;
        inSingleLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '\n') {
        line += 1;
      }

      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      if (char === '\n') {
        line += 1;
      }

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === stringDelimiter) {
        inString = false;
        stringDelimiter = '';
      }
      continue;
    }

    if (char === '\n') {
      line += 1;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inSingleLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      inString = true;
      stringDelimiter = char;
      escaped = false;
      continue;
    }

    for (const pattern of DISALLOWED_PATTERNS) {
      if (!content.startsWith(pattern.token, index)) {
        continue;
      }

      const tokenStart = index;
      const tokenEnd = tokenStart + pattern.token.length;

      if (pattern.hasLeadingWordBoundary && !hasWordBoundaryBefore(content, tokenStart)) {
        continue;
      }

      if (pattern.hasTrailingWordBoundary && !hasWordBoundaryAfter(content, tokenEnd)) {
        continue;
      }

      violations.push({ line, token: pattern.token });
      index = tokenEnd - 1;
      break;
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
    const rawRelativeSpecPath = path.relative(repoRoot, absoluteSpecPath);
    if (rawRelativeSpecPath.startsWith('..') || path.isAbsolute(rawRelativeSpecPath)) {
      throw new Error(`Spec path escapes repository root: ${specPath}`);
    }

    const relativeSpecPath = normalizePath(rawRelativeSpecPath);

    if (!fs.existsSync(absoluteSpecPath)) {
      missingSpecs.push(relativeSpecPath);
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(absoluteSpecPath, 'utf8');
    } catch (error) {
      throw new Error(
        `Unable to read spec file: ${relativeSpecPath}${
          error instanceof Error ? `: ${error.message}` : ''
        }`
      );
    }
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
      `Found ${missingSpecs.length} missing spec(s) and ${tokenViolations.length} no-skip violation(s) across ${requiredSpecs.length} required spec file(s).`
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
  if (error instanceof CliUsageError) {
    printUsage();
  }
  process.exit(1);
}
