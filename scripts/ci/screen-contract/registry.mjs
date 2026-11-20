// The consent registry of CHK-22 (WP-05 design §2.1): schema, the trusted-base comparison and the
// per-kind test evidence. The lint rule reads the same parsed registry through `registryFor`.
import path from 'node:path';

import ts from 'typescript';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import { multisetMinus } from '../server-mutation/baseline.mjs';
import { readInside } from './paths.mjs';
import { resolverFor } from './specifiers.mjs';

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
    const text = readInside(root, REGISTRY_PATH) ?? '';
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
const USE_FIELDS = ['file', 'submission', 'test'];
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
  const uses = new Map(after.uses.map(use => [use.useId, use]));
  for (const use of before.uses) {
    const now = uses.get(use.useId);
    if (!now) out.push(`CHK-22#registry-removed-use:${id}:${use.useId}`);
    // A use is its file, submission and test; keeping only its useId is a change (r1 H3).
    else if (USE_FIELDS.some(field => now[field] !== use[field]))
      out.push(`CHK-22#registry-changed-use:${id}:${use.useId}`);
  }
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

const VITEST_CONFIG = 'apps/web/vitest.config.ts';
const PLAYWRIGHT_CONFIG = 'apps/web/playwright.config.ts';
// The selection both PR-gate projects share (`gate-ks-sq`, `gate-mk-contract`): the E2E lane a
// use's spec must be in (r1 B8). Tags and `grep` inside a spec are not modelled (a named limit).
const E2E_GATE_CONST = 'GATE_DEFAULT_MATCH';

function parseConfig(root, rel) {
  const text = readInside(root, rel);
  if (text === null) throw new ScanError(`${rel} is missing`);
  if (!text.trim()) throw new ScanError(`${rel} is empty`);
  return ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

const nameOf = node =>
  node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ? node.name.text
    : null;

// Every node of a source file, depth first.
function nodesOf(source) {
  const out = [];
  const visit = node => {
    out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

// A literal list of strings, or null when the node is anything else.
function stringList(node) {
  if (!node || !ts.isArrayLiteralExpression(node)) return null;
  const out = node.elements.map(e => (ts.isStringLiteralLike(e) ? e.text : null));
  return out.includes(null) ? null : out;
}

// The one property `name` inside the object property `parent` (e.g. test.include), parsed.
function propertyIn(source, parent, name) {
  const hits = nodesOf(source).filter(
    node =>
      ts.isPropertyAssignment(node) &&
      nameOf(node) === parent &&
      ts.isObjectLiteralExpression(node.initializer)
  );
  const found = hits.flatMap(hit =>
    hit.initializer.properties.filter(p => ts.isPropertyAssignment(p) && nameOf(p) === name)
  );
  return found.length === 1 ? found[0].initializer : null;
}

// The lane selections, parsed from the lane configs without running them (r1 B8): the Vitest
// `test.include` and `test.exclude` lists, and the Playwright `testDir` with the gate selection.
export function readLanes(root) {
  const vitest = parseConfig(root, VITEST_CONFIG);
  const include = stringList(propertyIn(vitest, 'test', 'include'));
  if (!include?.length) throw new ScanError(`${VITEST_CONFIG} names no literal test.include list`);
  const excludeNode = propertyIn(vitest, 'test', 'exclude');
  const exclude = excludeNode ? stringList(excludeNode) : [];
  if (exclude === null) throw new ScanError(`${VITEST_CONFIG} test.exclude is not a literal list`);
  const playwright = parseConfig(root, PLAYWRIGHT_CONFIG);
  const dirs = nodesOf(playwright).filter(
    node =>
      ts.isPropertyAssignment(node) &&
      nameOf(node) === 'testDir' &&
      ts.isStringLiteralLike(node.initializer)
  );
  if (dirs.length !== 1)
    throw new ScanError(`${PLAYWRIGHT_CONFIG} names no single literal testDir`);
  const gate = nodesOf(playwright).filter(
    node => ts.isVariableDeclaration(node) && nameOf(node) === E2E_GATE_CONST
  );
  const e2eMatch = gate.length === 1 ? stringList(gate[0].initializer) : null;
  if (!e2eMatch?.length)
    throw new ScanError(`${PLAYWRIGHT_CONFIG} names no literal ${E2E_GATE_CONST} list`);
  return {
    vitest: { include, exclude },
    e2eDir: path.posix.normalize(path.posix.join('apps/web', dirs[0].initializer.text)),
    e2eMatch,
  };
}

// A Vitest exclude entry without glob characters names a directory anywhere in the path.
const excludeGlobs = entry => (/[*?{[]/u.test(entry) ? [entry] : [`${entry}/**`, `**/${entry}/**`]);

function inLane(lanes, rel) {
  if (rel.startsWith(`${lanes.e2eDir}/`)) {
    const inner = rel.slice(lanes.e2eDir.length + 1);
    return lanes.e2eMatch.some(glob => path.matchesGlob(inner, glob));
  }
  if (!rel.startsWith('apps/web/')) return false;
  const inner = rel.slice('apps/web/'.length);
  if (!lanes.vitest.include.some(glob => path.matchesGlob(inner, glob))) return false;
  return !lanes.vitest.exclude.flatMap(excludeGlobs).some(glob => path.matchesGlob(inner, glob));
}

const MOCK_CALLEE_RE =
  /^(?:vi|jest)\.(?:mock|doMock|importActual|importMock)$|^(?:require|import)$/u;

// The module specifiers a test file loads (imports, re-exports, import(), require(), mocks) and
// the identifiers it uses.
function testFacts(rel, text) {
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const specifiers = [];
  const identifiers = new Set();
  for (const node of nodesOf(source)) {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    )
      specifiers.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const callee = node.expression.getText(source);
      if (MOCK_CALLEE_RE.test(callee)) specifiers.push(node.arguments[0].text);
    }
  }
  return { specifiers, identifiers };
}

// The names a use's test must hold that it lacks: entry, use, the fields of its kind, and for
// consent a time field. The submission is checked by identity, not by name (r1 B8).
function missingNames(entry, use, text) {
  const names = [entry.id, use.useId];
  names.push(...REQUIRED_BY_KIND[entry.kind].map(key => entry[key]));
  const missing = names.filter(name => !text.includes(name));
  if (entry.kind === 'consent' && !TIME_RE.test(text)) missing.push('a time field');
  return missing;
}

// The test must load the submission's module (resolved like the lint resolves it) and use its
// export as an identifier.
function submissionError(root, use, text) {
  const [module, exportName] = use.submission.split('#');
  const { specifiers, identifiers } = testFacts(use.test, text);
  const resolver = resolverFor(root);
  const loads = specifiers.some(spec => resolver.resolveFile(use.test, spec) === module);
  if (!loads) return `does not import the submission module ${module}`;
  return identifiers.has(exportName) ? null : `does not use the submission export ${exportName}`;
}

// The error of one use's test, or null when its evidence holds.
function useEvidenceError(root, lanes, entry, use) {
  const where = `consent registry ${entry.id}:${use.useId} test ${use.test}`;
  const text = readInside(root, use.test);
  if (text === null) return `${where} is missing`;
  if (!text.trim()) return `${where} is empty`;
  if (!inLane(lanes, use.test)) return `${where} is selected by no lane`;
  if (SKIPPED_RE.test(text)) return `${where} is skipped`;
  const submission = submissionError(root, use, text);
  if (submission) return `${where} ${submission}`;
  const missing = missingNames(entry, use, text);
  return missing.length ? `${where} does not name ${missing.join(', ')}` : null;
}

// Errors for each use's test (§2.1 "The test, per kind"): it exists, is in a lane, is not skipped,
// loads the registered submission and names the entry, the use and the fields of its kind.
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
