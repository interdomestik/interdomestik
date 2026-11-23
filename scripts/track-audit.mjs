// track-audit.mjs — runs the checks of docs/delivery-contract.yml.
//
// A regex check may carry `exclude:`, a list of `{ file, reason }` entries that the check skips.
// The list cannot grow silently: each entry must name an existing file, matched by the check's
// targets, with a non-empty reason, and it must still violate the check; a stale entry fails.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { glob } from 'glob';
import yaml from 'js-yaml';

export const CONTRACT_PATH = 'docs/delivery-contract.yml';

function regexViolations(check, content) {
  const found = [];
  for (const pattern of check.must_match || []) {
    if (!new RegExp(pattern).test(content)) found.push(`must match regex '${pattern}'`);
  }
  for (const pattern of check.must_not_match || []) {
    if (new RegExp(pattern).test(content)) found.push(`must NOT match regex '${pattern}'`);
  }
  return found;
}

function exclusions(check, targeted, root, failures) {
  const excluded = new Set();
  if (check.exclude === undefined) return excluded;
  if (check.type !== 'regex' || !Array.isArray(check.exclude) || check.exclude.length === 0) {
    failures.push(`Check ${check.id}: exclude must be a non-empty list on a regex check`);
    return excluded;
  }
  for (const entry of check.exclude) {
    const file = typeof entry?.file === 'string' ? entry.file.trim() : '';
    const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
    const label = `Check ${check.id}: exclude entry '${file || '?'}'`;
    if (!file || !reason) {
      failures.push(`${label} needs a file and a non-empty reason`);
    } else if (excluded.has(file)) {
      failures.push(`${label} is listed twice`);
    } else if (!fs.existsSync(path.join(root, file))) {
      failures.push(`${label} is stale: file not found`);
    } else if (!targeted.includes(file)) {
      failures.push(`${label} is not matched by the check's targets`);
    } else if (
      regexViolations(check, fs.readFileSync(path.join(root, file), 'utf8')).length === 0
    ) {
      failures.push(`${label} is stale: the file no longer violates the check`);
    } else {
      excluded.add(file);
    }
    // An invalid entry excludes nothing: its file is still checked.
  }
  return excluded;
}

const listFiles = (pattern, root) =>
  glob.sync(pattern, { cwd: root }).filter(file => fs.statSync(path.join(root, file)).isFile());

function auditRegexCheck(check, root, failures) {
  const perTarget = check.targets.map(target => [target, listFiles(target, root)]);
  const excluded = exclusions(
    check,
    perTarget.flatMap(([, matched]) => matched),
    root,
    failures
  );
  for (const [target, matched] of perTarget) {
    // A target that matches no file would pass without checking anything.
    if (matched.length === 0) failures.push(`Check ${check.id} failed: no file matches ${target}`);
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
    if (!Array.isArray(check.targets) || check.targets.length === 0) {
      failures.push(`Check ${check.id} has no targets`);
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
