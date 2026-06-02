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

export const CLAIM_STATUS_WRITER_ALLOWLIST = new Set([
  'apps/web/e2e/gate/agent-workspace-claims-selection.spec.ts',
  'apps/web/src/features/admin/claims/actions/ops-actions.ts',
  'packages/database/src/seed-full/claims.ts',
  'packages/database/src/seed-golden/claims.ts',
  'packages/database/src/seed-packs/ks-workflow-pack.ts',
  'packages/database/test/rls-engaged.test.ts',
  'packages/domain-claims/src/claims/create.ts',
  'packages/domain-claims/src/claims/draft.ts',
  'packages/domain-claims/src/claims/submit.ts',
  'packages/domain-claims/src/claims/transition.ts',
  'packages/domain-claims/src/staff-claims/update-status.ts',
  'packages/domain-claims/src/update-claim-status.ts',
  'scripts/ci/db-access-guard.test.mjs',
  'scripts/pilot/day1_multi_seeder.ts',
  'scripts/pilot/day1_run3_lifecycle.ts',
  'scripts/pilot/simulate_agent_claim.ts',
  'scripts/pilot/simulate_triage.ts',
]);

const CLAIMS_REF = String.raw`(?:schema\.)?claims`;
const STATUS_UPDATE_PATTERNS = [
  // Drizzle updates with status in set
  new RegExp(
    String.raw`\.update\(\s*${CLAIMS_REF}\s*\)[\s\S]{0,1200}\.set\(\s*\{[\s\S]{0,800}\bstatus\b`,
    'u'
  ),
  new RegExp(
    String.raw`\.update\(\s*${CLAIMS_REF}\s*\)[\s\S]{0,1200}\.set\(\s*updateData\s*\)`,
    'u'
  ),
  // Drizzle inserts with status
  new RegExp(
    String.raw`\.insert\(\s*${CLAIMS_REF}\s*\)[\s\S]{0,1400}\.values\(\s*\{[\s\S]{0,1000}\bstatus\s*:`,
    'u'
  ),
  new RegExp(
    String.raw`\.insert\(\s*${CLAIMS_REF}\s*\)[\s\S]{0,1800}\.onConflictDoUpdate\([\s\S]{0,900}\bstatus\s*:`,
    'u'
  ),
  // Raw SQL updates/inserts
  /UPDATE\s+claims\s+SET\s+[\s\S]{0,150}\bstatus\b/iu,
  /INSERT\s+INTO\s+claims\s+[\s\S]{0,250}\bstatus\b/iu,
];

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
  return STATUS_UPDATE_PATTERNS.some(pattern => pattern.test(source));
}

export function findClaimStatusWriterViolations(root = process.cwd()) {
  const discovered = [];
  const files = walkFiles(root);
  for (const file of files) {
    const relativePath = toPosix(path.relative(root, file));
    if (
      relativePath === 'scripts/check-claim-status-writers.mjs' ||
      relativePath === 'scripts/ci/claim-status-writer-guard.test.mjs'
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
