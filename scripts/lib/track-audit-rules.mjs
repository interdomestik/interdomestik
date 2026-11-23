// Rules of the delivery-contract audit: how a check's patterns apply, which check shapes are
// valid, and when an `exclude:` entry may skip a file.
import fs from 'node:fs';
import path from 'node:path';

import { stripComments } from './strip-comments.mjs';

export function regexViolations(check, source) {
  const content = check.strip_comments === true ? stripComments(source) : source;
  const found = [];
  for (const pattern of check.must_match || []) {
    if (!new RegExp(pattern).test(content)) found.push(`must match regex '${pattern}'`);
  }
  for (const pattern of check.must_not_match || []) {
    if (new RegExp(pattern).test(content)) found.push(`must NOT match regex '${pattern}'`);
  }
  return found;
}

const ENTRY_KEYS = new Set(['file', 'reason']);

// Why an exclusion entry is invalid, or '' when it is valid.
function entryProblem(entry, check, targeted, root) {
  const file = typeof entry?.file === 'string' ? entry.file.trim() : '';
  const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
  if (!file || !reason) return 'needs a file and a non-empty reason';
  const unknown = Object.keys(entry).filter(key => !ENTRY_KEYS.has(key));
  if (unknown.length > 0) return `has unsupported keys: ${unknown.join(', ')}`;
  if (!fs.existsSync(path.join(root, file))) return 'is stale: file not found';
  if (!targeted.includes(file)) return "is not matched by the check's targets";
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  if (regexViolations(check, content).length === 0) {
    return 'is stale: the file no longer violates the check';
  }
  return '';
}

// A file is excluded only when every entry naming it is valid and it is named exactly once; any
// invalid or duplicate entry leaves that file checked.
export function exclusions(check, targeted, root, failures) {
  const excluded = new Set();
  if (check.exclude === undefined) return excluded;
  if (check.type !== 'regex' || !Array.isArray(check.exclude) || check.exclude.length === 0) {
    failures.push(`Check ${check.id}: exclude must be a non-empty list on a regex check`);
    return excluded;
  }
  const named = new Map();
  for (const entry of check.exclude) {
    const file = typeof entry?.file === 'string' ? entry.file.trim() : '';
    const label = `Check ${check.id}: exclude entry '${file || '?'}'`;
    const problem = entryProblem(entry, check, targeted, root);
    if (problem) failures.push(`${label} ${problem}`);
    if (named.has(file)) failures.push(`${label} is listed twice`);
    named.set(file, named.has(file) ? false : !problem);
  }
  for (const [file, valid] of named) if (valid) excluded.add(file);
  return excluded;
}

const CHECK_KEYS = new Set([
  'id',
  'description',
  'type',
  'scope',
  'targets',
  'optional_targets',
  'must_match',
  'must_not_match',
  'exclude',
  'strip_comments',
]);
const isPatternList = value =>
  value === undefined ||
  (Array.isArray(value) && value.every(item => typeof item === 'string' && item !== ''));

// A malformed check would pass without checking anything: unknown or misspelt keys, and a regex
// check without one pattern.
export function shapeProblem(check) {
  const unknown = Object.keys(check ?? {}).filter(key => !CHECK_KEYS.has(key));
  if (unknown.length > 0) return `has unsupported keys: ${unknown.join(', ')}`;
  if (!Array.isArray(check.targets) || check.targets.length === 0) return 'has no targets';
  if (!check.targets.every(target => typeof target === 'string' && target.trim() !== '')) {
    return 'has a target that is not a non-empty path';
  }
  const optional = check.optional_targets;
  if (
    optional !== undefined &&
    !(
      Array.isArray(optional) &&
      optional.length > 0 &&
      optional.every(target => typeof target === 'string' && target.trim() !== '')
    )
  ) {
    return 'has optional_targets that are not a non-empty list of non-empty paths';
  }
  if (check.type !== 'regex') {
    const regexOnly = ['must_match', 'must_not_match', 'optional_targets', 'strip_comments'].filter(
      key => check[key] !== undefined
    );
    return regexOnly.length > 0
      ? `has regex-only keys on a ${check.type} check: ${regexOnly.join(', ')}`
      : '';
  }
  if (check.strip_comments !== undefined && typeof check.strip_comments !== 'boolean') {
    return 'has strip_comments that is not a boolean';
  }
  if (!isPatternList(check.must_match) || !isPatternList(check.must_not_match)) {
    return 'has a pattern list that is not a list of non-empty strings';
  }
  if ((check.must_match?.length ?? 0) + (check.must_not_match?.length ?? 0) === 0) {
    return 'has no patterns';
  }
  return '';
}
