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

export const CONTRACT_PATH = 'docs/delivery-contract.yml';

const LINE_END = new Set(['\n', '\r', '\u2028', '\u2029']);
// A `/` after one of these (or at the start) begins a regular expression literal, not a division.
const REGEX_BEFORE = new Set([...'(,=:[!&|?{};+-*%<>~^'.split(''), '']);
const REGEX_KEYWORDS =
  /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/u;

function skipQuoted(source, start) {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length && source[i] !== quote && !LINE_END.has(source[i])) {
    i += source[i] === '\\' ? 2 : 1;
  }
  return i + 1;
}

function skipRegex(source, start) {
  let i = start + 1;
  let inClass = false;
  while (i < source.length && !LINE_END.has(source[i])) {
    const char = source[i];
    if (char === '\\') i += 1;
    else if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) break;
    i += 1;
  }
  return i + 1;
}

function regexAllowed(source, i) {
  const before = source.slice(0, i).trimEnd();
  return REGEX_BEFORE.has(before.at(-1) ?? '') || REGEX_KEYWORDS.test(before);
}

// Replaces JavaScript/TypeScript comments with spaces, keeping every line terminator, so that a
// pattern can neither be satisfied nor evaded by comment text. Strings, template text and regular
// expression literals are kept (a `/` after an operator, a bracket or a keyword starts a regular
// expression). `${…}` inside a template is scanned as code.
function lineCommentEnd(source, start) {
  let end = start + 2;
  while (end < source.length && !LINE_END.has(source[end])) end += 1;
  return end;
}

function blockCommentEnd(source, start) {
  const close = source.indexOf('*/', start + 2);
  return close === -1 ? source.length : close + 2;
}

// Template text from `start` (a backtick, or the `}` closing a substitution) to the next backtick or
// `${`; returns its end and whether it opened a substitution.
function templateChunkEnd(source, start) {
  let end = start + 1;
  while (end < source.length && source[end] !== '`' && !source.startsWith('${', end)) {
    end += source[end] === '\\' ? 2 : 1;
  }
  return source.startsWith('${', end) ? [end + 2, true] : [end + 1, false];
}

// One token at `i`: [end, text to emit]. `braces` tracks open `{`, true for a substitution.
function nextToken(source, i, braces) {
  const char = source[i];
  const pair = source.slice(i, i + 2);
  if (pair === '//') {
    const end = lineCommentEnd(source, i);
    return [end, ' '.repeat(end - i)];
  }
  if (pair === '/*') {
    const end = blockCommentEnd(source, i);
    return [end, source.slice(i, end).replaceAll(/[^\n\r\u2028\u2029]/gu, ' ')];
  }
  if (char === '"' || char === "'") {
    const end = skipQuoted(source, i);
    return [end, source.slice(i, end)];
  }
  if (char === '`' || (char === '}' && braces.at(-1) === true)) {
    if (char === '}') braces.pop();
    const [end, opened] = templateChunkEnd(source, i);
    if (opened) braces.push(true);
    return [end, source.slice(i, end)];
  }
  if (char === '/' && regexAllowed(source, i)) {
    const end = skipRegex(source, i);
    return [end, source.slice(i, end)];
  }
  if (char === '{') braces.push(false);
  else if (char === '}') braces.pop();
  return [i + 1, char];
}

export function stripComments(source) {
  const braces = [];
  let out = '';
  for (let i = 0; i < source.length;) {
    const [end, text] = nextToken(source, i, braces);
    out += text;
    i = end;
  }
  return out;
}

function regexViolations(check, source) {
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
function exclusions(check, targeted, root, failures) {
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
function shapeProblem(check) {
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
