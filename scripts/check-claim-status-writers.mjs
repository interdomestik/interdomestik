#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

// Exclude directories that do not contain application code or are generated
const EXCLUDED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
  '.pnpm-store',
  '.vercel',
  '.vscode',
  '.genkit',
  'docs',
  'LEGAL',
  'load-test-evidence',
  'stress-test-evidence',
  'project-documentation',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export const CLAIM_STATUS_TRANSITION_WRITERS = new Set([]);
export const CLAIM_STATUS_INITIALIZATION_WRITERS = new Set([]);
export const CLAIM_STATUS_COMPAT_REPAIR_WRITERS = new Set([]);
export const CLAIM_STATUS_FIXTURE_WRITERS = new Set([]);

export const CLAIM_STATUS_WRITER_ALLOWLIST = new Set([
  ...CLAIM_STATUS_TRANSITION_WRITERS,
  ...CLAIM_STATUS_INITIALIZATION_WRITERS,
  ...CLAIM_STATUS_COMPAT_REPAIR_WRITERS,
  ...CLAIM_STATUS_FIXTURE_WRITERS,
]);

const RAW_CLAIM_TABLE_REF = String.raw`(?:(?:"[^"]+"|[A-Za-z_]\w*)\.)?(?:"claim"|claim|claims)`;
const IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`;
// Local names the claims table goes by in one file: `claims`, `schema.claims`, a renamed import
// (`claims as claimRows`) and any namespace import's `claims` member (`import * as s` -> `s.claims`).
const RENAMED_CLAIMS_IMPORT = new RegExp(String.raw`\bclaims\s+as\s+(${IDENTIFIER})`, 'gu');
const NAMESPACE_IMPORT = new RegExp(String.raw`\bimport\s+\*\s+as\s+(${IDENTIFIER})`, 'gu');

function claimsReference(source) {
  const names = new Set(['claims', 'schema\\.claims']);
  for (const match of source.matchAll(RENAMED_CLAIMS_IMPORT)) names.add(escapeRegex(match[1]));
  for (const match of source.matchAll(NAMESPACE_IMPORT))
    names.add(`${escapeRegex(match[1])}\\.claims`);
  return `(?:${[...names].join('|')})`;
}

function statusUpdatePatterns(claimsRef) {
  return [
    // Drizzle updates with status in set
    new RegExp(
      String.raw`\.update\(\s*${claimsRef}\s*\)(?:(?!;)[\s\S]){0,1200}\.set\(\s*\{(?:(?!\n\s*\}\s*\))[\s\S]){0,800}\bstatus\s*:`,
      'u'
    ),
    // Drizzle inserts with status
    new RegExp(
      String.raw`\.insert\(\s*${claimsRef}\s*\)(?:(?!;)[\s\S]){0,1400}\.values\(\s*\{(?:(?!\n\s*\}\s*\);)[\s\S]){0,1000}\bstatus\s*:`,
      'u'
    ),
    new RegExp(
      String.raw`\.insert\(\s*${claimsRef}\s*\)(?:(?!;)[\s\S]){0,1800}\.onConflictDoUpdate\(\s*\{(?:(?!\n\s*\}\s*\))[\s\S]){0,900}\bset\s*:\s*\{(?:(?!\n\s*\}\s*\))[\s\S]){0,800}\bstatus\s*:`,
      'u'
    ),
    // Raw SQL updates/inserts
    new RegExp(String.raw`UPDATE\s+${RAW_CLAIM_TABLE_REF}\s+SET\s+[\s\S]{0,150}\bstatus\b`, 'iu'),
    new RegExp(String.raw`INSERT\s+INTO\s+${RAW_CLAIM_TABLE_REF}\s+[\s\S]{0,250}\bstatus\b`, 'iu'),
  ];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function containsClaimStatusVariableSet(source, claimsRef) {
  const setVariable = new RegExp(
    String.raw`\.update\(\s*${claimsRef}\s*\)(?:(?!;)[\s\S]){0,1200}\.set\(\s*(${IDENTIFIER})\s*\)`,
    'gu'
  );
  for (const match of source.matchAll(setVariable)) {
    const variableName = match[1];
    const declaration = new RegExp(
      String.raw`\b(?:const|let|var)\s+${escapeRegex(variableName)}\s*=\s*\{[\s\S]{0,800}\bstatus\s*:`,
      'u'
    );
    if (declaration.test(source)) return true;
  }
  return false;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walkFiles(root, files = []) {
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walkFiles(fullPath, files);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

export function containsClaimStatusWrite(source) {
  const claimsRef = claimsReference(source);
  return (
    statusUpdatePatterns(claimsRef).some(pattern => pattern.test(source)) ||
    containsClaimStatusVariableSet(source, claimsRef)
  );
}

export function findClaimStatusWriterViolations(root = process.cwd()) {
  const discovered = [];
  const files = walkFiles(root);
  for (const file of files) {
    const relativePath = toPosix(path.relative(root, file));
    if (
      relativePath === 'scripts/check-claim-status-writers.mjs' ||
      relativePath === 'scripts/ci/claim-status-writer-guard.test.mjs' ||
      relativePath === 'scripts/ci/claim-status-writer-guard-raw-sql.test.mjs'
    ) {
      continue;
    }
    const source = fs.readFileSync(file, 'utf8');
    if (containsClaimStatusWrite(source)) {
      discovered.push(relativePath);
    }
  }

  const unexpected = discovered.filter(file => !CLAIM_STATUS_WRITER_ALLOWLIST.has(file));
  const missing = [...CLAIM_STATUS_WRITER_ALLOWLIST].filter(file => !discovered.includes(file));
  return { discovered, missing, unexpected };
}

export function runClaimStatusWriterGuard(root = process.cwd()) {
  const { discovered, missing, unexpected } = findClaimStatusWriterViolations(root);
  if (unexpected.length > 0 || missing.length > 0) {
    console.error('Claim status writer inventory guard failed:');
    for (const file of unexpected) console.error(`- unexpected claims.status writer: ${file}`);
    for (const file of missing) console.error(`- inventoried writer not detected: ${file}`);
    return 1;
  }

  console.log(`Claim status writer inventory guard passed (${discovered.length} writers).`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runClaimStatusWriterGuard());
}
