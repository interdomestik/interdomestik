import { ScanError } from '../server-mutation/ast.mjs';

// A path segment Node refuses in a target or a pattern match: `.`, `..` or
// `node_modules`, case-insensitive and percent-encoded. INVALID_SEGMENT also
// matches an empty segment, which Node refuses in a pattern match but only
// deprecates in a target.
const SEGMENT_BODY = String.raw`(?:(?:\.|%2e)(?:\.|%2e)?|(?:n|%6e|%4e)(?:o|%6f|%4f)(?:d|%64|%44)(?:e|%65|%45)(?:_|%5f)(?:m|%6d|%4d)(?:o|%6f|%4f)(?:d|%64|%44)(?:u|%75|%55)(?:l|%6c|%4c)(?:e|%65|%45)(?:s|%73|%53))`;
const INVALID_TARGET_SEGMENT = new RegExp(String.raw`(?:^|\\|/)${SEGMENT_BODY}(?:\\|/|$)`, 'i');
const INVALID_SEGMENT = new RegExp(String.raw`(?:^|\\|/)${SEGMENT_BODY}?(?:\\|/|$)`, 'i');
const ARRAY_INDEX_KEY = /^(?:0|[1-9]\d*)$/;

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSubpathKey = key => key.startsWith('.');

function hasExports(pkg) {
  return pkg.exports !== undefined && pkg.exports !== null;
}

function invalidTargetReason(target) {
  if (!target.startsWith('./')) return 'does not start with "./"';
  if (INVALID_TARGET_SEGMENT.test(target.slice(2)))
    return 'has a ".", ".." or "node_modules" segment';
  return null;
}

function validateConditionObject(value, where) {
  for (const key of Object.keys(value)) {
    if (isSubpathKey(key))
      throw new ScanError(`${where}: subpath key "${key}" inside a condition object`);
    if (ARRAY_INDEX_KEY.test(key)) throw new ScanError(`${where}: numeric condition key "${key}"`);
    validateTarget(value[key], `${where}.${key}`);
  }
}

// Every target, an array's entries included, is valid or an input error (§5). Node would skip an
// invalid array entry; here it is malformed input.
function validateTarget(value, where) {
  if (value === null) return;
  if (typeof value === 'string') {
    const reason = invalidTargetReason(value);
    if (reason) throw new ScanError(`${where}: target "${value}" ${reason}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateTarget(entry, `${where}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    validateConditionObject(value, where);
    return;
  }
  throw new ScanError(`${where}: invalid target of type ${typeof value}`);
}

function exportsShape(exportsField, where) {
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) return 'root';
  if (!isPlainObject(exportsField)) {
    throw new ScanError(`${where}: "exports" must be a string, an array or an object`);
  }
  const keys = Object.keys(exportsField);
  const subpathKeys = keys.filter(isSubpathKey);
  if (subpathKeys.length === 0) return 'root';
  if (subpathKeys.length !== keys.length) {
    throw new ScanError(`${where}: "exports" mixes subpath keys and condition keys`);
  }
  return 'subpaths';
}

export function validateExports(pkg, label) {
  const where = `${label ?? pkg?.name ?? 'package'} exports`;
  if (!isPlainObject(pkg)) throw new ScanError(`${where}: package.json is not an object`);
  if (!hasExports(pkg)) return;
  const shape = exportsShape(pkg.exports, where);
  if (shape === 'root') {
    validateTarget(pkg.exports, where);
    return;
  }
  for (const [key, value] of Object.entries(pkg.exports)) {
    validateTarget(value, `${where}["${key}"]`);
  }
}

export { INVALID_SEGMENT, exportsShape, hasExports, isPlainObject, isSubpathKey };
