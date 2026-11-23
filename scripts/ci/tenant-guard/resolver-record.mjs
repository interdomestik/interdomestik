// Shape validation of the owner-pinned resolver record (resolver-baseline.mjs). Any defect refuses
// schema admission on every run, whatever the trees contain.

import path from 'node:path/posix';
import { BUNDLER_CONFIG_NAME, isRoot, LOCAL } from './bundler-closure.mjs';
import { byCodeUnit } from './rules-digest.mjs';

const HASH = /^sha256:[0-9a-f]{64}$/u;
const HEX = /^[0-9a-f]{64}$/u;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const LOCK = 'pnpm-lock.yaml';
const keysAre = (value, keys) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort((a, b) => byCodeUnit(a, b))) ===
    JSON.stringify(keys.toSorted((a, b) => byCodeUnit(a, b)));
const text = value => typeof value === 'string' && value.length > 0;
const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
const tuples = (list, valid) => Array.isArray(list) && [...list].every(entry => valid(entry));
const unique = list => new Set(list.map(entry => JSON.stringify(entry))).size === list.length;

// The scope wrapper is unordered. Node's conditional exports and imports retain their order.
export const scopeTuple = ([file, manifest, fields]) => [
  file,
  manifest,
  fields === null ? null : [fields.name, fields.exports, fields.imports, fields.type],
];

const pairTuple = ({ state, bundler: { files, edges, externals, scopes } }) => [
  state,
  files,
  edges,
  externals,
  scopes.map(scope => scopeTuple(scope)),
];

export const sameResolverPair = (left, right) =>
  JSON.stringify(pairTuple(left)) === JSON.stringify(pairTuple(right));

function localTargetMatches(importer, specifier, target) {
  return (
    LOCAL.test(specifier) &&
    !path.isAbsolute(target) &&
    !target.startsWith('../') &&
    !target.startsWith('external:') &&
    !BUNDLER_CONFIG_NAME.test(path.basename(target)) &&
    path.join(path.dirname(importer), specifier) === target
  );
}

function allFilesReachable(localEdges) {
  const queue = [...localEdges.keys()].filter(file => isRoot(file));
  const reached = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    for (const target of localEdges.get(queue[i])) {
      if (reached.has(target)) continue;
      reached.add(target);
      queue.push(target);
    }
  }
  return reached.size === localEdges.size;
}

function bundlerEdgesOk(edges, externals, filePaths) {
  const localEdges = new Map([...filePaths].map(file => [file, []]));
  const edgeExternals = new Set();
  for (const [importer, specifier, target] of edges) {
    const targets = localEdges.get(importer);
    if (!targets) return false;
    if (specifier.startsWith('.')) {
      if (!filePaths.has(target) || !localTargetMatches(importer, specifier, target)) return false;
      targets.push(target);
    } else {
      if (target !== `external:${specifier}`) return false;
      edgeExternals.add(specifier);
    }
  }
  return (
    JSON.stringify(externals) ===
      JSON.stringify([...edgeExternals].sort((a, b) => byCodeUnit(a, b))) &&
    allFilesReachable(localEdges)
  );
}

function bundlerLinksOk({ files, edges, externals, scopes }) {
  const filePaths = new Set(files.map(([file]) => file));
  const scopeImporters = new Set(scopes.map(([file]) => file));
  return (
    filePaths.size === files.length &&
    scopeImporters.size === scopes.length &&
    scopes.length === files.length &&
    scopes.every(([file]) => filePaths.has(file)) &&
    bundlerEdgesOk(edges, externals, filePaths)
  );
}

function bundlerShapeOk(bundler) {
  return (
    keysAre(bundler, ['files', 'edges', 'externals', 'scopes']) &&
    tuples(
      bundler.files,
      e => Array.isArray(e) && e.length === 2 && text(e[0]) && matches(e[1], HEX)
    ) &&
    tuples(
      bundler.edges,
      e => Array.isArray(e) && e.length === 3 && [...e].every(value => text(value))
    ) &&
    tuples(bundler.externals, value => text(value)) &&
    tuples(
      bundler.scopes,
      e =>
        Array.isArray(e) &&
        e.length === 3 &&
        text(e[0]) &&
        ((e[1] === null && e[2] === null) ||
          (text(e[1]) && keysAre(e[2], ['name', 'exports', 'imports', 'type'])))
    ) &&
    unique(bundler.edges) &&
    bundlerLinksOk(bundler)
  );
}

const pairShapeOk = pair =>
  keysAre(pair, ['state', 'bundler']) && matches(pair.state, HASH) && bundlerShapeOk(pair.bundler);
const digestOrNull = value => value === null || matches(value, HASH);

function rowsProblem(files) {
  if (!Array.isArray(files)) return 'resolver successor files malformed';
  const paths = new Set();
  for (const row of files) {
    if (!keysAre(row, ['path', 'before', 'after']) || !text(row.path) || row.path === LOCK)
      return 'resolver successor row malformed';
    if (!digestOrNull(row.before) || !digestOrNull(row.after) || row.before === row.after)
      return `resolver successor row ${row.path} is not a change`;
    if (paths.has(row.path)) return `resolver successor row ${row.path} duplicated`;
    paths.add(row.path);
  }
  return null;
}

function successorProblem(successor, baseline) {
  if (successor === null) return null;
  if (!keysAre(successor, ['id', 'before', 'after', 'files', 'lock']) || !matches(successor.id, ID))
    return 'resolver successor malformed';
  if (!pairShapeOk(successor.before) || !sameResolverPair(successor.before, baseline))
    return 'resolver successor does not start at the baseline';
  if (!pairShapeOk(successor.after)) return 'resolver successor state malformed';
  if (sameResolverPair(successor.after, baseline)) return 'resolver successor changes nothing';
  const rows = rowsProblem(successor.files);
  if (rows) return rows;
  const { lock } = successor;
  if (
    lock !== null &&
    (!keysAre(lock, ['before', 'after']) ||
      !matches(lock.before, HASH) ||
      !matches(lock.after, HASH) ||
      lock.before === lock.after)
  )
    return 'resolver successor lock malformed';
  return null;
}

/** Null when the record is well formed, otherwise the reason it refuses. */
export function resolverRecordProblem(record) {
  if (!keysAre(record, ['baseline', 'successor'])) return 'resolver record malformed';
  if (!pairShapeOk(record.baseline)) return 'resolver baseline malformed';
  return successorProblem(record.successor, record.baseline);
}
