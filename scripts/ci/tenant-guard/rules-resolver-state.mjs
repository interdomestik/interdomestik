// The reviewed resolver state (R1, R2): resolver inputs and the bundler closure are admitted only
// as the reviewed baseline, or across one exact owner-pinned transition to a reviewed successor.
//
// S is today's resolver projection (builderInput) plus the Drizzle lock projection. B is the bundler
// closure (bundler-closure.mjs). R1 admits a protected base whose (S, B) pair is the baseline or the
// successor's `after`, so a difference already on the base is never attributed to a PR. R2 admits a
// candidate whose pair equals its base's, or that crosses the exact successor edge with every
// projection-changed path, every byte-edited manifest of a changed package scope and, when its
// projection changes, the lock bound by raw bytes on both trees. Everything else refuses.

import { bundlerClosure } from './bundler-closure.mjs';
import { RESOLVER_BASELINE, RESOLVER_SUCCESSOR } from './resolver-baseline.mjs';
import {
  resolverRecordProblem as recordShapeProblem,
  sameResolverPair,
  scopeTuple,
} from './resolver-record.mjs';
import { byCodeUnit, sha256 } from './rules-digest.mjs';
import { builderInput, reviewedLockBlocks } from './schema-builder-provenance.mjs';

export const RESOLVER_RECORD = Object.freeze({
  baseline: RESOLVER_BASELINE,
  successor: RESOLVER_SUCCESSOR,
});

const LOCK = 'pnpm-lock.yaml';
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const rowTuple = ({ path, before, after }) => [path, before, after];
const lockTuple = ({ before, after }) => [before, after];
const raw = (tree, file) =>
  tree.blobs.has(file) ? `sha256:${sha256(tree.blobs.get(file))}` : null;

function projection(tree) {
  const entries = new Map();
  for (const file of tree.inputs.keys()) {
    if (file === LOCK) continue;
    const value = builderInput(tree, file);
    if (value !== undefined) entries.set(file, value);
  }
  return entries;
}
const lockProjection = tree => reviewedLockBlocks(tree.inputs.get(LOCK) ?? '');

const pairs = new WeakMap();
/** The (S, B) pair of an authenticated image, or the reason its bundler closure is unbindable. */
export function resolverPair(tree) {
  if (pairs.has(tree)) return pairs.get(tree);
  const inputs = [...projection(tree)].sort(([left], [right]) => byCodeUnit(left, right));
  const state = `sha256:${sha256(JSON.stringify([inputs, lockProjection(tree)]))}`;
  const closure = bundlerClosure(tree);
  const pair = closure.reason ? { reason: closure.reason } : { state, bundler: closure.value };
  pairs.set(tree, pair);
  return pair;
}

const reviewed = (pair, { baseline, successor }) =>
  sameResolverPair(pair, baseline) ||
  (successor !== null && sameResolverPair(pair, successor.after));

/** R1: the protected base carries a reviewed resolver state. */
export function resolverBaseProblem(base, record) {
  const pair = resolverPair(base);
  if (pair.reason) return pair.reason;
  return reviewed(pair, record) ? null : 'resolver state is not the reviewed baseline';
}

function firstChange(before, after) {
  const left = projection(before);
  const right = projection(after);
  const files = [...new Set([...left.keys(), ...right.keys()])].sort(byCodeUnit);
  return files.filter(file => left.get(file) !== right.get(file));
}

function changedScopeManifests(before, after, base, candidate) {
  const key = record => JSON.stringify(scopeTuple(record));
  const left = new Set(before.bundler.scopes.map(key));
  const right = new Set(after.bundler.scopes.map(key));
  const changed = [
    ...before.bundler.scopes.filter(record => !right.has(key(record))),
    ...after.bundler.scopes.filter(record => !left.has(key(record))),
  ];
  return changed
    .map(record => record[1])
    .filter(file => file !== null && raw(base, file) !== raw(candidate, file));
}

/**
 * The raw-byte binding of a base→candidate resolver change: every projection-changed path and every
 * manifest of a changed package scope whose bytes changed (a path whose projection changed only
 * through a changed parent config is bound through that parent), plus the lock when its projection
 * changed.
 */
function transitionBinding(base, candidate, before, after) {
  const paths = new Set([
    ...firstChange(base, candidate),
    ...changedScopeManifests(before, after, base, candidate),
  ]);
  const files = [...paths]
    .sort(byCodeUnit)
    .map(file => ({ path: file, before: raw(base, file), after: raw(candidate, file) }))
    .filter(row => row.before !== row.after);
  const lock = same(lockProjection(base), lockProjection(candidate))
    ? null
    : { before: raw(base, LOCK), after: raw(candidate, LOCK) };
  return { files, lock };
}

function edgeProblem(base, candidate, before, after, successor) {
  const expected = transitionBinding(base, candidate, before, after);
  const rows = new Map(successor.files.map(row => [row.path, row]));
  if (expected.files.length !== rows.size || expected.files.some(row => !rows.has(row.path)))
    return `resolver transition ${successor.id} does not list the changed paths`;
  for (const row of expected.files)
    if (!same(rowTuple(rows.get(row.path)), rowTuple(row)))
      return `resolver transition ${successor.id} bytes differ for ${row.path}`;
  if ((expected.lock === null) !== (successor.lock === null))
    return `resolver transition ${successor.id} lock binding mismatch`;
  if (expected.lock && !same(lockTuple(expected.lock), lockTuple(successor.lock)))
    return `resolver transition ${successor.id} bytes differ for ${LOCK}`;
  return null;
}

/** The RESOLVER_SUCCESSOR record for base→candidate (record generation; never an admission). */
export function resolverTransition(base, candidate, id) {
  const before = resolverPair(base);
  const after = resolverPair(candidate);
  if (before.reason || after.reason) return { reason: before.reason ?? after.reason };
  return { id, before, after, ...transitionBinding(base, candidate, before, after) };
}

function bundlerChange(before, after) {
  const files = new Map(before.bundler.files);
  const changed = after.bundler.files.find(([file, digest]) => files.get(file) !== digest);
  const removed = before.bundler.files.find(
    ([file]) => !after.bundler.files.some(e => e[0] === file)
  );
  return (changed ?? removed)?.[0] ?? 'imports';
}

/** R2: the candidate keeps its base's reviewed state or crosses the exact successor edge. */
export function resolverCandidateProblem(base, candidate, record) {
  const before = resolverPair(base);
  const after = resolverPair(candidate);
  if (before.reason) return before.reason;
  if (after.reason) return after.reason;
  if (sameResolverPair(before, after)) return null;
  const { baseline, successor } = record;
  if (
    successor !== null &&
    sameResolverPair(before, baseline) &&
    sameResolverPair(after, successor.after)
  )
    return edgeProblem(base, candidate, before, after, successor);
  const [file] = firstChange(base, candidate);
  if (file) return `resolver input changed ${file}`;
  if (!same(lockProjection(base), lockProjection(candidate)))
    return 'unreviewed Drizzle lock resolution';
  return `bundler closure changed ${bundlerChange(before, after)}`;
}

/** Null when the record (the owner pin by default) is well formed, otherwise its defect. */
export const resolverRecordProblem = (record = RESOLVER_RECORD) => recordShapeProblem(record);

/** R1 for the anchor→base comparison, R2 for base→candidate. */
export const resolverComparison = (before, after, accumulated, record = RESOLVER_RECORD) =>
  accumulated
    ? resolverBaseProblem(after, record)
    : resolverCandidateProblem(before, after, record);
