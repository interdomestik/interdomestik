// Package `exports` resolution for the screen contract check.
//
// Decides whether a workspace package specifier (`@interdomestik/ui/button`)
// reaches a declared, non-null target through the package's `exports` map, by
// Node's PACKAGE_EXPORTS_RESOLVE, PATTERN_KEY_COMPARE and PACKAGE_TARGET_RESOLVE
// (https://nodejs.org/api/esm.html#resolution-algorithm-specification), under
// the named condition sets below.
//
// `resolveExports` is the selection alone: the target string the map selects,
// as Node's ESM resolver selects it. `resolveEnvironment` is the verdict of one
// environment, as its oracle gives it, file on disk included (B4):
//   node-import, node-require  Node's selection; the selected file must exist.
//   bundler-browser            Node's selection (enhanced-resolve's); the file,
//                              or the file with one of its extensions, must exist.
//   types                      TypeScript, in two passes over the whole map:
//                              typed sources first, then JavaScript. In each,
//                              every array entry and condition is tried in
//                              order, a null or a target with no file of the
//                              pass on disk is passed over, and a target names
//                              its sources by TYPES_SOURCES.
// An edge passes only if every environment of its kind resolves (`checkEdge`):
// where the oracles disagree, the strictest verdict holds.
//
// Where this module is stricter than Node, it fails closed with a ScanError
// (an input error): a condition object that also holds a `.` key; an invalid
// target inside an array, which Node skips.

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';

const freezeList = list => Object.freeze([...list]);

export const ENVIRONMENTS = Object.freeze({
  'node-import': freezeList(['node', 'node-addons', 'import', 'module-sync', 'default']),
  'node-require': freezeList(['node', 'node-addons', 'require', 'module-sync', 'default']),
  'bundler-browser': freezeList(['browser', 'import', 'default']),
  types: freezeList(['types', 'import', 'default']),
});

// The extensions enhanced-resolve tries after a target (the bundler-browser oracle's).
export const BUNDLER_EXTENSIONS = freezeList(['.js', '.ts', '.d.ts']);

// TypeScript's files for a target, by the target's extension, in its order (moduleResolution
// Bundler, allowJs; measured with TypeScript 5.9 against every target extension and every pair of
// files): [typed pass, JavaScript pass]. A target with another extension, or none, has none.
const TYPES_PASSES = 2;
const TYPES_SOURCES = Object.freeze({
  '.js': freezeList([freezeList(['.ts', '.tsx', '.d.ts']), freezeList(['.js', '.jsx'])]),
  '.jsx': freezeList([freezeList(['.tsx', '.ts', '.d.ts']), freezeList(['.jsx', '.js'])]),
  '.mjs': freezeList([freezeList(['.mts', '.d.mts']), freezeList(['.mjs'])]),
  '.cjs': freezeList([freezeList(['.cts', '.d.cts']), freezeList(['.cjs'])]),
  '.ts': freezeList([freezeList(['.ts']), freezeList(['.js', '.jsx'])]),
  '.tsx': freezeList([freezeList(['.tsx']), freezeList(['.jsx', '.js'])]),
  '.mts': freezeList([freezeList(['.mts']), freezeList(['.mjs'])]),
  '.cts': freezeList([freezeList(['.cts']), freezeList(['.cjs'])]),
  '.d.ts': freezeList([freezeList(['.d.ts']), freezeList(['.js', '.jsx'])]),
  '.d.mts': freezeList([freezeList(['.d.mts']), freezeList(['.mjs'])]),
  '.d.cts': freezeList([freezeList(['.d.cts']), freezeList(['.cjs'])]),
  '.json': freezeList([freezeList([]), freezeList(['.json'])]),
});
// Longest first, so `.d.ts` wins over `.ts` and `a.d.js` is a `.js` target.
const TYPES_EXTENSIONS = Object.keys(TYPES_SOURCES).sort((a, b) => b.length - a.length);

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

// PACKAGE_TARGET_RESOLVE over validated targets. Returns a target string, null
// (blocked) or undefined (no condition matched). In an array, a null entry is
// passed over, as Node's implementation does.
function resolveArrayTarget(target, patternMatch, conditions) {
  if (target.length === 0) return null;
  let last;
  for (const entry of target) {
    const resolved = resolveTarget(entry, patternMatch, conditions);
    if (resolved === undefined) continue;
    if (resolved === null) {
      last = null;
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

const substitute = (target, patternMatch) =>
  patternMatch === null ? target : target.replaceAll('*', patternMatch);

function resolveTarget(target, patternMatch, conditions) {
  if (target === null) return null;
  if (typeof target === 'string') return substitute(target, patternMatch);
  if (Array.isArray(target)) return resolveArrayTarget(target, patternMatch, conditions);
  return resolveConditionTarget(target, patternMatch, conditions);
}

// TypeScript's PACKAGE_TARGET_RESOLVE: returns the file `accept` finds, MISSING
// (no typed source on disk), null (only nulls) or undefined (nothing matched).
// Every array entry and active condition is tried until one yields a file.
const MISSING = Symbol('missing');

function typesEntries(target, conditions) {
  if (Array.isArray(target)) return target;
  return Object.keys(target)
    .filter(key => key === 'default' || conditions.has(key))
    .map(key => target[key]);
}

function resolveTypesTarget(target, patternMatch, conditions, accept) {
  if (target === null) return null;
  if (typeof target === 'string') return accept(substitute(target, patternMatch)) ?? MISSING;
  let last;
  for (const entry of typesEntries(target, conditions)) {
    const resolved = resolveTypesTarget(entry, patternMatch, conditions, accept);
    if (typeof resolved === 'string') return resolved;
    if (resolved !== undefined) last = resolved;
  }
  return last;
}

// The files of one pass that TypeScript tries for a target, in its order.
function typesSources(target, pass) {
  const ext = TYPES_EXTENSIONS.find(key => target.endsWith(key));
  const sources = ext ? TYPES_SOURCES[ext][pass] : [];
  return sources.map(source => target.slice(0, target.length - ext.length) + source);
}

// The types row: the typed pass over the whole map, then the JavaScript pass (B8).
function resolveTypes(selected, conditions, fileExists) {
  let resolved;
  for (let pass = 0; pass < TYPES_PASSES; pass += 1) {
    const accept = target => typesSources(target, pass).find(fileExists);
    resolved = resolveTypesTarget(selected.target, selected.patternMatch, conditions, accept);
    if (typeof resolved === 'string') break;
  }
  return finish(resolved);
}

const bundlerFiles = target => [target, ...BUNDLER_EXTENSIONS.map(ext => target + ext)];

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
  if (resolved === MISSING) return { status: 'missing' };
  if (typeof resolved === 'string') return { status: 'resolved', target: resolved };
  return { status: 'not-exported' };
}

// The map entry a subpath selects, { target, patternMatch }, or a final verdict { status }.
function selectSubpath(pkg, subpath) {
  validateExports(pkg);
  if (subpath !== '.' && (typeof subpath !== 'string' || !subpath.startsWith('./'))) {
    throw new ScanError(`invalid package subpath: ${String(subpath)}`);
  }
  if (!hasExports(pkg)) {
    return subpath === '.' ? { status: 'resolved', target: null } : { status: 'no-exports' };
  }
  if (exportsShape(pkg.exports, 'exports') === 'root') {
    return subpath === '.'
      ? { target: pkg.exports, patternMatch: null }
      : { status: 'not-exported' };
  }
  const match = matchSubpath(subpath, pkg.exports);
  if (match === null) return { status: 'not-exported' };
  if (match.patternMatch !== null && INVALID_SEGMENT.test(match.patternMatch)) {
    return { status: 'not-exported' };
  }
  return match;
}

export function resolveExports(pkg, subpath, conditions) {
  const selected = selectSubpath(pkg, subpath);
  if (selected.status) return selected;
  const active = conditions instanceof Set ? conditions : new Set(conditions);
  return finish(resolveTarget(selected.target, selected.patternMatch, active));
}

// One environment's verdict, with `fileExists(target)` answering for a package-relative target
// ('./src/x.ts'): resolved (target: the file found), blocked, not-exported, no-exports or missing.
export function resolveEnvironment(pkg, subpath, env, fileExists) {
  if (typeof env !== 'string' || !Object.hasOwn(ENVIRONMENTS, env))
    throw new ScanError(`unknown environment: ${String(env)}`);
  if (typeof fileExists !== 'function') throw new ScanError('resolution needs a file check');
  const selected = selectSubpath(pkg, subpath);
  if (selected.status) return selected;
  const conditions = new Set(ENVIRONMENTS[env]);
  if (env === 'types') return resolveTypes(selected, conditions, fileExists);
  const resolved = resolveTarget(selected.target, selected.patternMatch, conditions);
  if (typeof resolved !== 'string') return finish(resolved);
  const files = env === 'bundler-browser' ? bundlerFiles(resolved) : [resolved];
  return finish(files.find(fileExists) ?? MISSING);
}

export function checkEdge(pkg, subpath, edgeKind, fileExists) {
  if (typeof fileExists !== 'function') throw new ScanError('checkEdge needs a file check');
  const environments = {};
  let ok = true;
  for (const env of environmentsFor(edgeKind)) {
    const result = resolveEnvironment(pkg, subpath, env, fileExists);
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
