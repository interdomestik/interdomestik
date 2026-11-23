// track-audit.mjs — runs the checks of docs/delivery-contract.yml.
//
// A regex check may carry `exclude:`, a list of `{ file, reason }` entries that the check skips.
// The list cannot grow silently: each entry must name an existing file, matched by the check's
// targets, once, with a non-empty reason and no other key, and it must still violate the check;
// any other entry fails the audit and leaves its file checked.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { glob } from 'glob';
import yaml from 'js-yaml';

import { exclusions, regexViolations, shapeProblem } from './lib/track-audit-rules.mjs';

export { stripComments } from './lib/strip-comments.mjs';

export const CONTRACT_PATH = 'docs/delivery-contract.yml';

const listFiles = (pattern, root) =>
  glob.sync(pattern, { cwd: root }).filter(file => fs.statSync(path.join(root, file)).isFile());

function auditRegexCheck(check, root, failures) {
  // `optional_targets` guard paths that may match no file today (a removed tree that must stay
  // covered if it returns); `targets` must each match at least one file.
  const perTarget = [
    ...check.targets.map(target => [target, listFiles(target, root), true]),
    ...(check.optional_targets ?? []).map(target => [target, listFiles(target, root), false]),
  ];
  const excluded = exclusions(
    check,
    perTarget.flatMap(([, matched]) => matched),
    root,
    failures
  );
  for (const [target, matched, required] of perTarget) {
    // A target that matches no file would pass without checking anything.
    if (required && matched.length === 0)
      failures.push(`Check ${check.id} failed: no file matches ${target}`);
    for (const file of matched.filter(name => !excluded.has(name))) {
      const content = fs.readFileSync(path.join(root, file), 'utf8');
      for (const violation of regexViolations(check, content)) {
        failures.push(`Check ${check.id} failed: ${file} ${violation}`);
      }
    }
  }
}

function auditFileCheck(check, root, failures) {
  for (const target of check.targets) {
    if (check.type === 'file_exists' && !fs.existsSync(path.join(root, target))) {
      failures.push(`Check ${check.id} failed: File not found ${target}`);
    }
    const found = check.type === 'file_not_exists' ? glob.sync(target, { cwd: root }) : [];
    if (found.length > 0) {
      failures.push(`Check ${check.id} failed: Files SHOULD NOT exist: ${found.join(', ')}`);
    }
  }
}

export function auditContract(contract, root = process.cwd()) {
  if (!contract || !Array.isArray(contract.checks) || contract.checks.length === 0) {
    return ['The contract has no checks'];
  }
  const failures = [];
  for (const check of contract.checks) {
    const problem = shapeProblem(check);
    if (problem) {
      failures.push(`Check ${check?.id} ${problem}`);
    } else if (check.type === 'regex') {
      auditRegexCheck(check, root, failures);
    } else if (check.type === 'file_exists' || check.type === 'file_not_exists') {
      if (check.exclude !== undefined) exclusions(check, [], root, failures);
      auditFileCheck(check, root, failures);
    } else {
      failures.push(`Check ${check.id} has an unknown type '${check.type}'`);
    }
  }
  return failures;
}

export function runTrackAudit(root = process.cwd(), log = console) {
  log.log('🔍 Tracking Audit: Reading Delivery Contract...');
  const contractFile = path.join(root, CONTRACT_PATH);
  if (!fs.existsSync(contractFile)) {
    log.error(`❌ Missing ${CONTRACT_PATH}`);
    return 1;
  }
  let contract;
  try {
    contract = yaml.load(fs.readFileSync(contractFile, 'utf8'));
  } catch (error) {
    log.error(`❌ Unreadable ${CONTRACT_PATH}: ${error.message}`);
    return 1;
  }
  log.log(`✅ Loaded contract version: ${contract?.version}`);
  const failures = auditContract(contract, root);
  for (const failure of failures) log.error(`❌ ${failure}`);
  if (failures.length > 0) {
    log.error(`🛑 Audit Failed: ${failures.length} checks failed.`);
    return 1;
  }
  log.log('✅ Audit Passed: All checks green.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runTrackAudit();
}
