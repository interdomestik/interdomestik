import { ScanError } from '../server-mutation/ast.mjs';
import { isCanonicalSource, isPlainPath, readInside } from './paths.mjs';

export const REGISTRY_PATH = 'scripts/ci/screen-contract-consent-registry.json';
const KINDS = new Set(['consent', 'selection', 'not-consent']);
const SUBMISSION_RE = /^[^#\s]+#[A-Za-z_$][\w$]*$/u;
const REQUIRED_BY_KIND = Object.freeze({
  consent: ['payloadField', 'storedIn', 'versionSource'],
  selection: ['selectedRecord', 'storedIn'],
  'not-consent': ['reason'],
});
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';

// Every path the registry names is checked before any file is read (r3 B1): a source file is a
// canonical linted source; a test is a plain repository path.
function requireSource(rel, what) {
  if (!isCanonicalSource(rel)) throw new ScanError(`${what} ${rel} is not a canonical source path`);
}

function validateUse(use, where, seen) {
  if (!isPlainObject(use)) throw new ScanError(`${where} is not an object`);
  for (const key of ['useId', 'file', 'submission', 'test'])
    if (!isText(use[key])) throw new ScanError(`${where} has no ${key}`);
  if (!SUBMISSION_RE.test(use.submission))
    throw new ScanError(`${where} submission is not <module path>#<export>`);
  requireSource(use.file, `${where} file`);
  requireSource(use.submission.split('#')[0], `${where} submission`);
  if (!isPlainPath(use.test)) throw new ScanError(`${where} test ${use.test} is not a plain path`);
  if (seen.has(use.useId)) throw new ScanError(`${where} repeats useId ${use.useId}`);
  seen.add(use.useId);
}

function validateFields(entry, where) {
  for (const key of ['id', 'file', 'control'])
    if (!isText(entry[key])) throw new ScanError(`${where} has no ${key}`);
  if (!/^[\w.-]+$/u.test(entry.id)) throw new ScanError(`${where} has an id with spaces or ':'`);
  requireSource(entry.file, `${where} file`);
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
  for (const alias of aliases) requireSource(alias.file, `${where} alias file`);
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
  // An exported control is judged only at its renders' boundaries. With no use nothing would ever
  // judge it (a route's component has no JSX caller), so it needs a use or selfSubmitting (r5 B2).
  if (entry.exportName && entry.kind !== 'not-consent' && !entry.selfSubmitting && !uses.length)
    throw new ScanError(`${where} has an exportName but no use and is not selfSubmitting`);
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

export { REQUIRED_BY_KIND };
