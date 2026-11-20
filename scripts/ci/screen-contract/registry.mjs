// The consent registry of CHK-22 (WP-05 design §2.1): schema, the trusted-base comparison and the
// per-kind test evidence. The lint rule reads the same parsed registry through `registryFor`.
import fs from 'node:fs';
import path from 'node:path';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import { multisetMinus } from '../server-mutation/baseline.mjs';

export const REGISTRY_PATH = 'scripts/ci/screen-contract/consent-registry.json';
const KINDS = new Set(['consent', 'selection', 'not-consent']);
const SUBMISSION_RE = /^[^#\s]+#[A-Za-z_$][\w$]*$/u;
const REQUIRED_BY_KIND = Object.freeze({
  consent: ['payloadField', 'storedIn', 'versionSource'],
  selection: ['selectedRecord', 'storedIn'],
  'not-consent': ['reason'],
});
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';

function validateUse(use, where, seen) {
  if (!isPlainObject(use)) throw new ScanError(`${where} is not an object`);
  for (const key of ['useId', 'file', 'submission', 'test'])
    if (!isText(use[key])) throw new ScanError(`${where} has no ${key}`);
  if (!SUBMISSION_RE.test(use.submission))
    throw new ScanError(`${where} submission is not <module path>#<export>`);
  if (seen.has(use.useId)) throw new ScanError(`${where} repeats useId ${use.useId}`);
  seen.add(use.useId);
}

function validateFields(entry, where) {
  for (const key of ['id', 'file', 'control'])
    if (!isText(entry[key])) throw new ScanError(`${where} has no ${key}`);
  if (!/^[\w.-]+$/u.test(entry.id)) throw new ScanError(`${where} has an id with spaces or ':'`);
  if (!KINDS.has(entry.kind)) throw new ScanError(`${where} has an unknown kind`);
  for (const key of REQUIRED_BY_KIND[entry.kind])
    if (!isText(entry[key])) throw new ScanError(`${where} (${entry.kind}) has no ${key}`);
  if (entry.exportName !== undefined && !isText(entry.exportName))
    throw new ScanError(`${where} has an empty exportName`);
  if (entry.selfSubmitting !== undefined && typeof entry.selfSubmitting !== 'boolean')
    throw new ScanError(`${where} has a non-boolean selfSubmitting`);
}

function validateAliases(entry, where) {
  const aliases = entry.aliases ?? [];
  if (
    !Array.isArray(aliases) ||
    !aliases.every(a => isPlainObject(a) && isText(a.file) && isText(a.exportName))
  )
    throw new ScanError(`${where} has malformed aliases`);
  return aliases;
}

function validateUses(entry, where) {
  const uses = entry.uses ?? [];
  if (!Array.isArray(uses)) throw new ScanError(`${where} uses is not a list`);
  if (entry.kind === 'not-consent' && uses.length)
    throw new ScanError(`${where} (not-consent) has uses`);
  const seen = new Set();
  uses.forEach((use, i) => validateUse(use, `${where} use ${i}`, seen));
  if (entry.selfSubmitting && (uses.length !== 1 || uses[0].file !== entry.file))
    throw new ScanError(`${where} is selfSubmitting with other than one use in its own file`);
  return uses;
}

function validateEntry(entry, index) {
  const where = `consent registry entry ${index}`;
  if (!isPlainObject(entry)) throw new ScanError(`${where} is not an object`);
  validateFields(entry, where);
  const aliases = validateAliases(entry, where);
  const uses = validateUses(entry, where);
  return { ...entry, aliases, uses };
}

// Parses a registry text: { version: 1, entries: [...] } -> Map id -> entry. `entries: []` is
// legal and fails closed (every candidate is then unregistered).
export function parseRegistry(text, label = 'consent registry') {
  if (typeof text !== 'string' || !text.trim()) throw new ScanError(`${label} is missing or empty`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ScanError(`${label} is not valid JSON`);
  }
  if (!isPlainObject(data) || data.version !== 1) throw new ScanError(`${label} has no version 1`);
  if (!Array.isArray(data.entries)) throw new ScanError(`${label} has no entries list`);
  const out = new Map();
  data.entries.forEach((raw, index) => {
    const entry = validateEntry(raw, index);
    if (out.has(entry.id)) throw new ScanError(`${label} has a duplicate id ${entry.id}`);
    out.set(entry.id, entry);
  });
  return out;
}

const registries = new Map();

// The registry of a target tree, parsed once per process.
export function registryFor(root) {
  if (!registries.has(root)) {
    const file = path.join(root, REGISTRY_PATH);
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    registries.set(root, parseRegistry(text, 'head consent registry'));
  }
  return registries.get(root);
}

const BOUND_FIELDS = [
  'kind',
  'file',
  'control',
  'exportName',
  'storedIn',
  'payloadField',
  'selectedRecord',
];
const exceptionKey = e => `${e.check}\u0000${e.item}\u0000${e.kind}`;

// Tamper findings of the registry against the trusted base (§2.1 "Judged against the trusted
// base"); each needs the owner's fresh `#registry:<id>` exception of CHK-22.
export function registryTamper(baseRegistry, headRegistry, base, head, isRendered) {
  if (!baseRegistry) {
    return [...headRegistry.values()]
      .filter(entry => entry.kind === 'not-consent')
      .filter(entry => !freshFor(base, head, entry.id))
      .map(entry => `CHK-22#registry-not-consent:${entry.id}`);
  }
  const out = [];
  for (const [id, before] of baseRegistry)
    out.push(...entryTamper(id, before, headRegistry.get(id), isRendered));
  for (const [id, entry] of headRegistry)
    if (!baseRegistry.has(id) && entry.kind === 'not-consent')
      out.push(`CHK-22#registry-not-consent:${id}`);
  // One fresh exception per entry admits every change of that entry.
  return out.filter(finding => !freshFor(base, head, idOfFinding(finding)));
}

// The changes of one base entry in the head: removed, a bound field changed, a use or alias removed.
function entryTamper(id, before, after, isRendered) {
  if (!after) return isRendered(before) ? [`CHK-22#registry-removed:${id}`] : [];
  const out = [];
  for (const field of BOUND_FIELDS)
    if (before[field] !== after[field]) out.push(`CHK-22#registry-changed-${field}:${id}`);
  const useIds = new Set(after.uses.map(use => use.useId));
  for (const use of before.uses)
    if (!useIds.has(use.useId)) out.push(`CHK-22#registry-removed-use:${id}:${use.useId}`);
  const aliasKeys = new Set(after.aliases.map(a => `${a.file}#${a.exportName}`));
  for (const alias of before.aliases)
    if (!aliasKeys.has(`${alias.file}#${alias.exportName}`))
      out.push(`CHK-22#registry-removed-alias:${id}:${alias.file}#${alias.exportName}`);
  return out;
}

const idOfFinding = finding => finding.split(':')[1];

function freshFor(base, head, id) {
  const fresh = multisetMinus(
    (head?.exceptions ?? []).map(exceptionKey),
    (base?.exceptions ?? []).map(exceptionKey)
  );
  return ['replaced', 'downgrade', 'added'].some(kind =>
    fresh.includes(exceptionKey({ check: 'CHK-22', item: `#registry:${id}`, kind }))
  );
}

const SKIPPED_RE = /\b(?:it|test|describe)\s*\.\s*(?:skip|todo|fixme)\b|\bx(?:it|describe)\s*\(/u;
// A time-field name ends in one of these (`createdAt`, `granted_at`, `timestamp`); the regex only
// tests for one, so the leading word characters need no match of their own.
const TIME_RE = /(?:At|_at|Time|time|timestamp)\b/u;

// The include globs of the web Vitest config and the Playwright testDir, read at run time.
export function readLanes(root) {
  const vitest = readConfig(root, 'apps/web/vitest.config.ts');
  const include = /\binclude\s*:\s*\[([^\]]*)\]/u.exec(vitest)?.[1];
  const globs = [...(include ?? '').matchAll(/['"]([^'"]+)['"]/gu)].map(m => m[1]);
  if (!globs.length) throw new ScanError('apps/web/vitest.config.ts names no include glob');
  const playwright = readConfig(root, 'apps/web/playwright.config.ts');
  const testDir = /\btestDir\s*:\s*['"]([^'"]+)['"]/u.exec(playwright)?.[1];
  if (!testDir) throw new ScanError('apps/web/playwright.config.ts names no testDir');
  return { vitest: globs, e2eDir: path.posix.normalize(path.posix.join('apps/web', testDir)) };
}

function readConfig(root, rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new ScanError(`${rel} is missing`);
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) throw new ScanError(`${rel} is empty`);
  return text;
}

function inLane(lanes, rel) {
  if (rel.startsWith(`${lanes.e2eDir}/`) && /\.spec\.[cm]?[jt]sx?$/u.test(rel)) return true;
  if (!rel.startsWith('apps/web/')) return false;
  const inner = rel.slice('apps/web/'.length);
  return lanes.vitest.some(glob => path.matchesGlob(inner, glob));
}

// The names a use's test must hold that it lacks: entry, use, submission, the fields of its kind,
// and for consent a time field.
function missingNames(entry, use, text) {
  const names = [entry.id, use.useId, use.submission.split('#')[1]];
  names.push(...REQUIRED_BY_KIND[entry.kind].map(key => entry[key]));
  const missing = names.filter(name => !text.includes(name));
  if (entry.kind === 'consent' && !TIME_RE.test(text)) missing.push('a time field');
  return missing;
}

// The error of one use's test, or null when its evidence holds.
function useEvidenceError(root, lanes, entry, use) {
  const where = `consent registry ${entry.id}:${use.useId} test ${use.test}`;
  const file = path.join(root, use.test);
  if (!fs.existsSync(file)) return `${where} is missing`;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return `${where} is empty`;
  if (!inLane(lanes, use.test)) return `${where} is selected by no lane`;
  if (SKIPPED_RE.test(text)) return `${where} is skipped`;
  const missing = missingNames(entry, use, text);
  return missing.length ? `${where} does not name ${missing.join(', ')}` : null;
}

// Errors for each use's test (§2.1 "The test, per kind"): it exists, is in a lane, is not skipped
// and names the entry, the use, the submission and the fields of its kind.
export function testEvidence(root, registry, lanes) {
  const errors = [];
  for (const entry of [...registry.values()].sort((a, b) => byCodeUnit(a.id, b.id))) {
    if (entry.kind === 'not-consent') continue;
    for (const use of entry.uses) {
      const error = useEvidenceError(root, lanes, entry, use);
      if (error !== null) errors.push(error);
    }
  }
  return errors;
}
