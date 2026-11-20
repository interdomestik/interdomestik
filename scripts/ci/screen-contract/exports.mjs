// Package `exports` resolution for the screen contract check.
//
// Decides whether a workspace package specifier (`@interdomestik/ui/button`)
// reaches a declared, non-null target through the package's `exports` map, by
// Node's PACKAGE_EXPORTS_RESOLVE, PATTERN_KEY_COMPARE and PACKAGE_TARGET_RESOLVE
// (https://nodejs.org/api/esm.html#resolution-algorithm-specification), under
// the named condition sets below. It never looks at files on disk: a target is
// the string the map selects, as Node's ESM resolver selects it.
//
// Where this module is stricter than Node, it fails closed with a ScanError
// (an input error): a condition object that also holds a `.` key.

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';

const freezeList = list => Object.freeze([...list]);

export const ENVIRONMENTS = Object.freeze({
  'node-import': freezeList(['node', 'node-addons', 'import', 'module-sync', 'default']),
  'node-require': freezeList(['node', 'node-addons', 'require', 'module-sync', 'default']),
  'bundler-browser': freezeList(['browser', 'import', 'default']),
  types: freezeList(['types', 'import', 'default']),
});

const EDGE_ENVIRONMENTS = Object.freeze({
  import: freezeList(['node-import', 'bundler-browser', 'types']),
  dynamic: freezeList(['node-import', 'bundler-browser', 'types']),
  require: freezeList(['node-require', 'types']),
  type: freezeList(['types']),
});

const MODELLED_CONDITIONS = new Set([
  'node',
  'node-addons',
  'import',
  'require',
  'module-sync',
  'browser',
  'types',
  'default',
]);

// A path segment Node refuses in a target or a pattern match: `.`, `..` or
// `node_modules`, case-insensitive and percent-encoded. INVALID_SEGMENT also
// matches an empty segment, which Node refuses in a pattern match but only
// deprecates in a target.
const SEGMENT_BODY =
  '(?:(?:\\.|%2e)(?:\\.|%2e)?|(?:n|%6e|%4e)(?:o|%6f|%4f)(?:d|%64|%44)(?:e|%65|%45)(?:_|%5f)(?:m|%6d|%4d)(?:o|%6f|%4f)(?:d|%64|%44)(?:u|%75|%55)(?:l|%6c|%4c)(?:e|%65|%45)(?:s|%73|%53))';
const INVALID_TARGET_SEGMENT = new RegExp(`(?:^|\\\\|/)${SEGMENT_BODY}(?:\\\\|/|$)`, 'i');
const INVALID_SEGMENT = new RegExp(`(?:^|\\\\|/)${SEGMENT_BODY}?(?:\\\\|/|$)`, 'i');
const ARRAY_INDEX_KEY = /^(?:0|[1-9]\d*)$/;

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSubpathKey = key => key.startsWith('.');

export function environmentsFor(edgeKind) {
  if (typeof edgeKind !== 'string' || !Object.hasOwn(EDGE_ENVIRONMENTS, edgeKind)) {
    throw new ScanError(`unknown edge kind: ${String(edgeKind)}`);
  }
  return [...EDGE_ENVIRONMENTS[edgeKind]];
}

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
    validateTarget(value[key], `${where}.${key}`, false);
  }
}

function validateTarget(value, where, inArray) {
  if (value === null) return;
  if (typeof value === 'string') {
    const reason = invalidTargetReason(value);
    // An invalid entry of an array is skipped at resolution, as in Node.
    if (reason && !inArray) throw new ScanError(`${where}: target "${value}" ${reason}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateTarget(entry, `${where}[${index}]`, true));
    return;
  }
  if (isPlainObject(value)) {
    validateConditionObject(value, where);
    return;
  }
  if (!inArray) throw new ScanError(`${where}: invalid target of type ${typeof value}`);
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
    validateTarget(pkg.exports, where, false);
    return;
  }
  for (const [key, value] of Object.entries(pkg.exports)) {
    validateTarget(value, `${where}["${key}"]`, false);
  }
}

// PACKAGE_TARGET_RESOLVE. Returns a target string, null (blocked), undefined
// (no condition matched) or INVALID (an invalid target, skipped in an array).
const INVALID = Symbol('invalid-target');

function resolveArrayTarget(target, patternMatch, conditions) {
  if (target.length === 0) return null;
  let last;
  for (const entry of target) {
    const resolved = resolveTarget(entry, patternMatch, conditions);
    if (resolved === undefined) continue;
    if (resolved === null || resolved === INVALID) {
      last = resolved;
      continue;
    }
    return resolved;
  }
  return last;
}

function resolveConditionTarget(target, patternMatch, conditions) {
  for (const key of Object.keys(target)) {
    if (key !== 'default' && !conditions.has(key)) continue;
    const resolved = resolveTarget(target[key], patternMatch, conditions);
    if (resolved === undefined) continue;
    return resolved;
  }
  return undefined;
}

function resolveTarget(target, patternMatch, conditions) {
  if (target === null) return null;
  if (typeof target === 'string') {
    if (invalidTargetReason(target)) return INVALID;
    return patternMatch === null ? target : target.replaceAll('*', patternMatch);
  }
  if (Array.isArray(target)) return resolveArrayTarget(target, patternMatch, conditions);
  if (isPlainObject(target)) return resolveConditionTarget(target, patternMatch, conditions);
  return INVALID;
}

// PATTERN_KEY_COMPARE for two keys that each hold one `*`.
function patternKeyCompare(keyA, keyB) {
  const baseA = keyA.indexOf('*') + 1;
  const baseB = keyB.indexOf('*') + 1;
  if (baseA !== baseB) return baseA > baseB ? -1 : 1;
  if (keyA.length !== keyB.length) return keyA.length > keyB.length ? -1 : 1;
  return 0;
}

// PACKAGE_IMPORTS_EXPORTS_RESOLVE: returns { target, patternMatch } or null.
function matchSubpath(subpath, map) {
  if (Object.hasOwn(map, subpath) && !subpath.includes('*')) {
    return { target: map[subpath], patternMatch: null };
  }
  const patternKeys = Object.keys(map)
    .filter(key => {
      const star = key.indexOf('*');
      return star !== -1 && star === key.lastIndexOf('*');
    })
    .sort(patternKeyCompare);
  for (const key of patternKeys) {
    const star = key.indexOf('*');
    const base = key.slice(0, star);
    const trailer = key.slice(star + 1);
    if (subpath.startsWith(base) && subpath.length >= key.length && subpath.endsWith(trailer)) {
      return {
        target: map[key],
        patternMatch: subpath.slice(star, subpath.length - trailer.length),
      };
    }
  }
  return null;
}

function finish(resolved) {
  if (resolved === null) return { status: 'blocked' };
  if (typeof resolved === 'string') return { status: 'resolved', target: resolved };
  return { status: 'not-exported' };
}

export function resolveExports(pkg, subpath, conditions) {
  validateExports(pkg);
  if (subpath !== '.' && (typeof subpath !== 'string' || !subpath.startsWith('./'))) {
    throw new ScanError(`invalid package subpath: ${String(subpath)}`);
  }
  const active = conditions instanceof Set ? conditions : new Set(conditions);
  if (!hasExports(pkg)) {
    return subpath === '.' ? { status: 'resolved', target: null } : { status: 'no-exports' };
  }
  if (exportsShape(pkg.exports, 'exports') === 'root') {
    if (subpath !== '.') return { status: 'not-exported' };
    return finish(resolveTarget(pkg.exports, null, active));
  }
  const match = matchSubpath(subpath, pkg.exports);
  if (match === null) return { status: 'not-exported' };
  if (match.patternMatch !== null && INVALID_SEGMENT.test(match.patternMatch)) {
    return { status: 'not-exported' };
  }
  return finish(resolveTarget(match.target, match.patternMatch, active));
}

export function checkEdge(pkg, subpath, edgeKind) {
  const environments = {};
  let ok = true;
  for (const env of environmentsFor(edgeKind)) {
    const result = resolveExports(pkg, subpath, ENVIRONMENTS[env]);
    environments[env] = result;
    if (result.status !== 'resolved') ok = false;
  }
  return { ok, environments };
}

function collectConditions(value, found) {
  if (Array.isArray(value)) {
    for (const entry of value) collectConditions(entry, found);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, inner] of Object.entries(value)) {
    if (!isSubpathKey(key) && !MODELLED_CONDITIONS.has(key)) found.add(key);
    collectConditions(inner, found);
  }
}

export function unmodelledConditions(pkg) {
  validateExports(pkg);
  if (!hasExports(pkg)) return [];
  const found = new Set();
  collectConditions(pkg.exports, found);
  return [...found].sort(byCodeUnit);
}
