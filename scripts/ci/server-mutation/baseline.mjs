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

// Parses and validates a baseline text; `checks` lists the check definitions this scanner knows.
export function parseBaseline(text, label, checks) {
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
  const known = new Map(checks.map(check => [check.id, check]));
  for (const [id, check] of Object.entries(data.checks)) {
    if (!known.has(id)) throw new ScanError(`${label} baseline names an unknown check ${id}`);
    validateCheck(`${label}:${id}`, check, known.get(id).multiset === true);
  }
  data.exceptions.forEach(validateException);
  return data;
}

const exceptionKey = e => `${e.check}\u0000${e.item}\u0000${e.kind}`;

// Exceptions count only when this change adds them; an exception already in the base is spent.
function freshExceptions(base, head) {
  const spent = new Set((base?.exceptions ?? []).map(exceptionKey));
  return new Set(head.exceptions.map(exceptionKey).filter(key => !spent.has(key)));
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

const coverageValues = value => (isCount(value) ? { '*': value } : value);

// Tamper findings of one check: the head baseline judged against the trusted base.
export function tamperFindings(id, base, head) {
  if (!base) return [];
  const fresh = freshExceptions(base, head);
  const allowed = (item, ...kinds) =>
    kinds.some(kind => fresh.has(exceptionKey({ check: id, item, kind })));
  const baseCheck = base.checks[id];
  const headCheck = head.checks[id];
  if (!baseCheck) return [];
  if (!headCheck) return allowed('#check', 'downgrade') ? [] : [`${id}#removed-check`];
  const out = [];
  if (baseCheck.mode === 'fail' && headCheck.mode !== 'fail' && !allowed('#mode', 'downgrade'))
    out.push(`${id}#downgrade`);
  for (const key of ['unit', 'predicate'])
    if (baseCheck[key] !== headCheck[key] && !allowed(`#${key}`, 'replaced'))
      out.push(`${id}#changed-${key}`);
  const before = coverageValues(baseCheck.coverageMin);
  const after = coverageValues(headCheck.coverageMin);
  const lowered = Object.keys(before).some(kind => !(after[kind] >= before[kind]));
  if (lowered && !allowed('#coverageMin', 'count')) out.push(`${id}#lowered-coverageMin`);
  if (
    baseCheck.exhausted === true &&
    headCheck.exhausted !== true &&
    !allowed('#exhausted', 'downgrade')
  )
    out.push(`${id}#reopened`);
  for (const item of multisetMinus(headCheck.items, baseCheck.items))
    if (!allowed(item, 'added', 'replaced')) out.push(`${id}#added:${item}`);
  return out;
}

export function ratchet(current, admitted) {
  return { new: multisetMinus(current, admitted), fixed: multisetMinus(admitted, current) };
}

export function coverageShortfall(units, coverageMin) {
  const required = coverageValues(coverageMin);
  const counted = isCount(units) ? { '*': units } : units;
  return Object.entries(required)
    .filter(([kind, min]) => !((counted[kind] ?? 0) >= min))
    .map(([kind, min]) => `${kind}: ${counted[kind] ?? 0} < ${min}`);
}
