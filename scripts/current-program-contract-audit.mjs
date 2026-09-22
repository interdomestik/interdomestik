#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { extractSection, parseTrackerDocument } from './plan-model.mjs';

const FILES = Object.freeze({
  agents: 'AGENTS.md',
  package: 'package.json',
  program: 'docs/plans/current-program.md',
  tracker: 'docs/plans/current-tracker.md',
  programHistory: 'docs/plans/history/2026-09-22-current-program-ledger.md',
  trackerHistory: 'docs/plans/history/2026-09-22-current-tracker-ledger.md',
});
const MAX_BYTES = 1024 * 1024;

function parseArgs(argv) {
  const args = [...argv];
  let root = process.cwd();
  while (args.length > 0) {
    const argument = args.shift();
    if (argument !== '--root') throw new Error(`unknown argument: ${argument}`);
    const value = args.shift();
    if (!value) throw new Error('missing value for --root');
    root = path.resolve(value);
  }
  return { root };
}

function read(root, repoPath, errors) {
  const absolute = path.resolve(root, repoPath);
  if (!fs.existsSync(absolute)) {
    errors.push(`${repoPath}: missing`);
    return '';
  }
  const size = fs.statSync(absolute).size;
  if (size > MAX_BYTES) {
    errors.push(`${repoPath}: exceeds ${MAX_BYTES}-byte active-authority bound`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function requireMatch(text, pattern, file, label, errors) {
  if (!pattern.test(text)) errors.push(`${file}: missing ${label}`);
}

function requireHeadings(text, file, headings, errors) {
  for (const heading of headings) {
    if (!extractSection(text, heading).trim()) errors.push(`${file}: missing ${heading} section`);
  }
}

function validateCurrentAuthority(root) {
  const errors = [];
  const agents = read(root, FILES.agents, errors);
  const program = read(root, FILES.program, errors);
  const tracker = read(root, FILES.tracker, errors);
  const programHistory = read(root, FILES.programHistory, errors);
  const trackerHistory = read(root, FILES.trackerHistory, errors);
  const packageText = read(root, FILES.package, errors);

  requireHeadings(
    program,
    FILES.program,
    [
      'Current Phase',
      'Program Goals',
      'Enduring Safety Boundaries',
      'Ordinary Product Delivery',
      'Model And Review Policy',
      'Product Queue And Dependencies',
      'Current Repair Acceptance',
      'Historical Evidence',
    ],
    errors
  );
  requireHeadings(
    tracker,
    FILES.tracker,
    [
      'Active Queue',
      'Product Queue',
      'Proof Ledger',
      'Current Facts',
      'Next Selection',
      'Historical Evidence',
    ],
    errors
  );

  const activeAuthority = [
    [agents, FILES.agents],
    [program, FILES.program],
  ];
  for (const [text, file] of activeAuthority) {
    for (const [pattern, label] of [
      [/apps\/web\/src\/proxy\.ts[^]*?read-only unless[^]*?explicit/u, 'read-only proxy authority'],
      [
        /\/member[^]*?\/agent[^]*?\/staff[^]*?\/admin[^]*?must not be renamed or bypassed/u,
        'protected canonical routes',
      ],
      [/page-ready[^]*?(?:contractual|enforced)/u, 'contractual clarity markers'],
      [/Supabase Auth[^]*?better-auth[^]*?@interdomestik\/shared-auth/u, 'authentication layering'],
      [/Authentication[^]*?never be bypassed[^]*?development/iu, 'no auth bypass'],
      [/tenant\/RLS[^]*?mandatory/iu, 'mandatory tenant/RLS boundary'],
      [/Paddle[^]*?only V3 pilot billing provider/u, 'Paddle-only billing boundary'],
      [/pnpm pr:verify[^]*?pnpm security:guard/u, 'required local verification'],
      [
        /README\.md[^]*?AGENTS\.md[^]*?architecture documents[^]*?(?:explicit[^]*?owner request|owner[^]*?explicit[^]*?requests?)/iu,
        'owner-only governance document changes',
      ],
      [/apps\/web\/package\.json/u, 'manifest version authority'],
    ]) {
      requireMatch(text, pattern, file, label, errors);
    }
  }

  for (const [pattern, label] of [
    [/requirement-disposition-map\.md/u, 'SRS requirement map'],
    [/architecture-finalization-program-2026-05-29\.md/u, 'architecture program'],
    [/architecture-finalization-tracker-2026-05-29\.md/u, 'architecture tracker'],
    [/history\/2026-09-22-current-program-ledger\.md/u, 'program history link'],
    [/history\/2026-09-22-current-tracker-ledger\.md/u, 'tracker history link'],
    [/plan:audit:legacy/u, 'explicit legacy plan audit'],
    [/test:harness-v2/u, 'explicit legacy Harness command'],
  ]) {
    requireMatch(program, pattern, FILES.program, label, errors);
  }

  for (const [text, file] of [
    [program, FILES.program],
    [tracker, FILES.tracker],
  ]) {
    if (/```json lean-authority/u.test(text)) errors.push(`${file}: embeds retired Lean authority`);
    if (/The next active governed implementation goal is resolved only by/u.test(text)) {
      errors.push(`${file}: embeds the retired active-goal marker`);
    }
    if (/^```(?:log|console|text)\s*$/imu.test(text)) {
      errors.push(`${file}: contains a raw runtime transcript block`);
    }
  }

  for (const [text, file] of activeAuthority) {
    if (/\b(?:Next\.js|React|Tailwind(?: CSS)?|next-intl)\s+v?\d+(?:\.\d+)*\b/iu.test(text)) {
      errors.push(`${file}: duplicates a hard-coded framework version`);
    }
  }

  const { queueRows, proofRows } = parseTrackerDocument(tracker);
  if (queueRows.length === 0) errors.push(`${FILES.tracker}: active queue is empty`);
  if (queueRows.filter(row => row.status === 'in_progress').length > 1) {
    errors.push(`${FILES.tracker}: more than one item is in progress`);
  }
  if (new Set(queueRows.map(row => row.id)).size !== queueRows.length) {
    errors.push(`${FILES.tracker}: duplicate active queue IDs`);
  }
  if (new Set(proofRows.map(row => row.id)).size !== proofRows.length) {
    errors.push(`${FILES.tracker}: duplicate proof ledger IDs`);
  }

  for (const [text, file] of [
    [programHistory, FILES.programHistory],
    [trackerHistory, FILES.trackerHistory],
  ]) {
    requireMatch(text, /^status:\s*archived$/mu, file, 'archived status', errors);
    requireMatch(text, /^source_of_truth:\s*false$/mu, file, 'non-authoritative status', errors);
    requireMatch(text, /^> Status: Archived/mu, file, 'visible archive banner', errors);
  }

  if (packageText) {
    let packageJson;
    try {
      packageJson = JSON.parse(packageText);
    } catch {
      errors.push(`${FILES.package}: invalid JSON`);
    }
    if (packageJson) {
      const scripts = packageJson.scripts ?? {};
      if (!scripts['plan:audit']?.includes('current-program-contract-audit.mjs')) {
        errors.push(`${FILES.package}: plan:audit must run the current program contract`);
      }
      if (scripts['plan:audit']?.includes('current-authority-format-audit.mjs')) {
        errors.push(`${FILES.package}: ordinary plan:audit invokes the legacy authority audit`);
      }
      if (!scripts['plan:audit:legacy']?.includes('current-authority-format-audit.mjs')) {
        errors.push(`${FILES.package}: missing explicit legacy authority audit`);
      }
      if (!scripts['test:delivery-safety']) {
        errors.push(`${FILES.package}: missing retained shared delivery-safety tests`);
      }
      if (scripts['test:ci:contracts']?.includes('lean-current-authority-contracts')) {
        errors.push(`${FILES.package}: ordinary CI contracts invoke the legacy authority wrapper`);
      }
      if (
        !scripts['legacy:validate']?.includes('lean-current-authority-contracts.legacy.mjs') ||
        !scripts['legacy:validate']?.includes('test:harness-v2')
      ) {
        errors.push(`${FILES.package}: explicit legacy validation is incomplete`);
      }
    }
  }

  return errors;
}

function main() {
  const { root } = parseArgs(process.argv.slice(2));
  const errors = validateCurrentAuthority(root);
  if (errors.length > 0) {
    console.error('current program contract audit failed');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log('current program contract audit passed');
}

try {
  main();
} catch (error) {
  console.error(`current program contract audit failed: ${error.message}`);
  process.exit(1);
}
