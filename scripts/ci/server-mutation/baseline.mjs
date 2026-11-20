// The shrink-only baseline (design §6.5): schema, the trusted-base comparison and the ratchet.
import { ScanError } from './ast.mjs';

export const BASELINE_PATH = 'scripts/ci/server-mutation-baseline.json';
const MODES = new Set(['report', 'fail']);
const EXCEPTION_KINDS = new Set(['added', 'replaced', 'downgrade', 'count']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCount = value => Number.isSafeInteger(value) && value >= 0;

function validCoverage(value) {
  if (isCount(value)) return true;
  return (
    isPlainObject(value) && Object.keys(value).length > 0 && Object.values(value).every(isCount)
  );
}

function validateCheck(id, check, multiset) {
  const where = `baseline check ${id}`;
  if (!isPlainObject(check)) throw new ScanError(`${where} is not an object`);
  if (!MODES.has(check.mode)) throw new ScanError(`${where} has an unknown mode`);
  for (const key of ['unit', 'predicate'])
    if (typeof check[key] !== 'string' || !check[key])
      throw new ScanError(`${where} has no ${key}`);
  if (!validCoverage(check.coverageMin)) throw new ScanError(`${where} has an invalid coverageMin`);
  if (!Array.isArray(check.items)) throw new ScanError(`${where} has no items list`);
  if (!check.items.every(item => typeof item === 'string' && item))
    throw new ScanError(`${where} has a non-string item`);
  if (check.exhausted !== undefined && typeof check.exhausted !== 'boolean')
    throw new ScanError(`${where} has a non-boolean exhausted`);
  if (check.items.length === 0 && check.exhausted !== true)
    throw new ScanError(`${where} has empty items without exhausted: true`);
  if (!multiset && new Set(check.items).size !== check.items.length)
    throw new ScanError(`${where} has duplicate items`);
}

function validateException(entry, index) {
  const where = `baseline exception ${index}`;
  if (!isPlainObject(entry)) throw new ScanError(`${where} is not an object`);
  if (typeof entry.check !== 'string' || typeof entry.item !== 'string' || !entry.item)
    throw new ScanError(`${where} needs check and item`);
  if (!EXCEPTION_KINDS.has(entry.kind)) throw new ScanError(`${where} has an unknown kind`);
  if (entry.approvedBy !== 'owner') throw new ScanError(`${where} is not approved by the owner`);
  if (typeof entry.ref !== 'string' || !entry.ref) throw new ScanError(`${where} has no ref`);
  if (typeof entry.date !== 'string' || !DATE_RE.test(entry.date))
    throw new ScanError(`${where} has no date`);
}

// A copy without a prototype, so a lookup by id or kind sees own keys only (Astra r4 B15).
const ownMap = value => Object.assign(Object.create(null), value);

// Parses and validates a baseline text; `checks` lists the check definitions this scanner knows.
// Design addendum 3 (replay contract, owner after Astra r4 B15/B18):
// - `trustedBase` admits a check this scanner no longer has, so its removal is judged as tamper
//   against the base (Astra r2 B10); a head never names one.
// - `only` (a scoped replay, `--check <id>`) keeps and validates that check's entry and exceptions
//   alone and ignores every other entry, known or unknown.
// Check and coverage maps come back without a prototype.
export function parseBaseline(text, label, checks, { trustedBase = false, only = null } = {}) {
  if (typeof text !== 'string' || !text.trim())
    throw new ScanError(`${label} baseline is missing or empty`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ScanError(`${label} baseline is not valid JSON`);
  }
  if (!isPlainObject(data) || data.version !== 1)
    throw new ScanError(`${label} baseline has no version 1`);
  if (typeof data.takenAt !== 'string' || !data.takenAt)
    throw new ScanError(`${label} baseline has no takenAt`);
  if (!isPlainObject(data.checks)) throw new ScanError(`${label} baseline has no checks`);
  if (!Array.isArray(data.exceptions))
    throw new ScanError(`${label} baseline has no exceptions list`);
  data.checks = keptChecks(data.checks, label, checks, { trustedBase, only });
  // A scoped replay keeps that check's exceptions only, so another check's entry cannot block it
  // (Astra r5 B15); a malformed exception of the scoped check is still an error.
  if (only !== null)
    data.exceptions = data.exceptions.filter(entry => isPlainObject(entry) && entry.check === only);
  data.exceptions.forEach(validateException);
  return data;
}

// The validated check entries a baseline keeps, in a map without a prototype.
function keptChecks(entries, label, checks, { trustedBase, only }) {
  const known = new Map(checks.map(check => [check.id, check]));
  const kept = Object.create(null);
  for (const [id, check] of Object.entries(entries)) {
    if (only !== null && id !== only) continue;
    if (!known.has(id) && !trustedBase)
      throw new ScanError(`${label} baseline names an unknown check ${id}`);
    // A retired check's item kind is no longer known: its items are compared as a multiset.
    const multiset = known.has(id) ? known.get(id).multiset === true : true;
    validateCheck(`${label}:${id}`, check, multiset);
    kept[id] = isPlainObject(check.coverageMin)
      ? { ...check, coverageMin: ownMap(check.coverageMin) }
      : check;
  }
  return kept;
}

const exceptionKey = e => `${e.check}\u0000${e.item}\u0000${e.kind}`;

// The owner's approvals of a check's removal, as kept in a baseline's exceptions.
const isRemoval = e => e.item === '#check' && e.kind === 'downgrade';
export const removedChecks = baseline => [
  ...new Set((baseline?.exceptions ?? []).filter(isRemoval).map(e => e.check)),
];
export const removalRecorded = (baseline, id) => removedChecks(baseline).includes(id);

// Exceptions count only when this change adds them; an exception already in the base is spent.
// A multiset: each fresh exception admits exactly one occurrence.
function freshExceptions(base, head) {
  const keys = multisetMinus(
    head.exceptions.map(exceptionKey),
    (base?.exceptions ?? []).map(exceptionKey)
  );
  const counts = new Map();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

export function multisetMinus(left, right) {
  const counts = new Map();
  for (const item of right) counts.set(item, (counts.get(item) ?? 0) + 1);
  const out = [];
  for (const item of left) {
    const n = counts.get(item) ?? 0;
    if (n > 0) counts.set(item, n - 1);
    else out.push(item);
  }
  return out;
}

const coverageValues = value => ownMap(isCount(value) ? { '*': value } : value);

// Tamper findings of one check: the head baseline judged against the trusted base.
export function tamperFindings(id, base, head) {
  if (!base) return [];
  const fresh = freshExceptions(base, head);
  // Consumes one fresh exception of the first matching kind, so it admits one occurrence only.
  const allowed = (item, ...kinds) => {
    const key = kinds
      .map(kind => exceptionKey({ check: id, item, kind }))
      .find(candidate => fresh.get(candidate) > 0);
    if (key) fresh.set(key, fresh.get(key) - 1);
    return Boolean(key);
  };
  const baseCheck = base.checks[id];
  const headCheck = head.checks[id];
  if (!baseCheck) return [];
  if (!headCheck) return allowed('#check', 'downgrade') ? [] : [`${id}#removed-check`];
  return [
    ...stateFindings(id, baseCheck, headCheck, allowed),
    ...multisetMinus(headCheck.items, baseCheck.items)
      .filter(item => !allowed(item, 'added', 'replaced'))
      .map(item => `${id}#added:${item}`),
  ];
}

// Findings on a check's mode, digests, coverage floor and exhaustion, in that order.
function stateFindings(id, baseCheck, headCheck, allowed) {
  const out = [];
  if (baseCheck.mode === 'fail' && headCheck.mode !== 'fail' && !allowed('#mode', 'downgrade'))
    out.push(`${id}#downgrade`);
  for (const key of ['unit', 'predicate'])
    if (baseCheck[key] !== headCheck[key] && !allowed(`#${key}`, 'replaced'))
      out.push(`${id}#changed-${key}`);
  const before = coverageValues(baseCheck.coverageMin);
  const after = coverageValues(headCheck.coverageMin);
  const lowered = Object.keys(before).some(kind => !atLeast(after[kind], before[kind]));
  if (lowered && !allowed('#coverageMin', 'count')) out.push(`${id}#lowered-coverageMin`);
  const reopened = baseCheck.exhausted === true && headCheck.exhausted !== true;
  if (reopened && !allowed('#exhausted', 'downgrade')) out.push(`${id}#reopened`);
  return out;
}

// `value >= min`, unchanged from the comparison the callers wrote inline (S1940): JavaScript's `>=`,
// so undefined or NaN never meets min and any other value is coerced as `>=` coerces it.
function atLeast(value, min) {
  return value >= min;
}

export function ratchet(current, admitted) {
  return { new: multisetMinus(current, admitted), fixed: multisetMinus(admitted, current) };
}

export function coverageShortfall(units, coverageMin) {
  const required = coverageValues(coverageMin);
  const counted = ownMap(isCount(units) ? { '*': units } : units);
  return Object.entries(required)
    .filter(([kind, min]) => !atLeast(counted[kind] ?? 0, min))
    .map(([kind, min]) => `${kind}: ${counted[kind] ?? 0} < ${min}`);
}
