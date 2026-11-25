// Authenticate the versioned kernel projection through the protected base and candidate.

import ts from 'typescript';
import { LEGACY } from './manifest.mjs';
import { hasParallelTarget } from './modules.mjs';
import { schemaDestructuringExports } from './rules-schema-destructuring.mjs';
import { resolverComparison, resolverRecordProblem } from './rules-resolver-state.mjs';
import { forwardInventory } from './rules-schema-public.mjs';
import { tableAdmissionProblem } from './rules-schema-tables.mjs';
import { kernelWalk } from './rules-trust.mjs';
import { SCHEMA_DIR } from './schema-builder-imports.mjs';
import { provenanceProblem } from './schema-builder-provenance.mjs';
import {
  isRateBookImport,
  parseRateBookTransition,
  RATE_BOOK_TRANSITION,
  rateBookTransition,
} from './schema-rate-book-transition.mjs';

const BARREL = `${SCHEMA_DIR}index.ts`;
const APPEND = /^export \* from '\.\/([A-Za-z0-9_-]+)';\n$/u;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function kernelAnchorPins(tree) {
  return new Map([...LEGACY.keys()].map(key => [key, kernelWalk(tree.graph, key).versioned]));
}

function moduleProblem(tree, file, kind) {
  if (!tree.sources.has(file)) return `missing ${kind} ${file}`;
  if (!tree.sources.get(file).length) return `empty ${kind} ${file}`;
  if (tree.graph.sourceFileOf(file).parseDiagnostics.length) return `unparseable ${kind} ${file}`;
  if (!tree.graph.exportNames(file).size) return `no runtime exports in ${kind} ${file}`;
  return null;
}

function image(tree, role) {
  if (!tree) return { reason: `missing ${role} input` };
  const reject = reason => ({ reason: `${role}: ${reason}` });
  const barrel = moduleProblem(tree, BARREL, 'barrel');
  if (barrel) return reject(barrel);
  const walks = new Map();
  const reachable = new Set();
  for (const key of LEGACY.keys()) {
    const [file, name] = key.split('#');
    const problem = moduleProblem(tree, file, 'entry');
    if (problem) return reject(problem);
    if (
      !tree.graph
        .resolveExport(file, name)
        .some(origin => origin.file === file && origin.name === name)
    )
      return reject(`missing entry export ${key}`);
    const walk = kernelWalk(tree.graph, key);
    walks.set(key, walk);
    for (const module of walk.seen) reachable.add(module);
  }
  return { ...tree, walks, reachable };
}

function appendedExports(before, after) {
  const previous = before.sources.get(BARREL);
  const current = after.sources.get(BARREL);
  if (!current.startsWith(previous)) return { reason: 'barrel is not a byte-identical prefix' };
  const suffix = current.slice(previous.length);
  if (!suffix) return { lines: [], nodes: [] };
  if (!previous.endsWith('\n') || !suffix.endsWith('\n'))
    return { reason: 'unsupported appended barrel export' };
  const lines = suffix
    .slice(0, -1)
    .split('\n')
    .map(line => `${line}\n`);
  const source = after.graph.sourceFileOf(BARREL);
  const nodes = source.statements.filter(node => node.getStart(source) >= previous.length);
  if (nodes.length !== lines.length) return { reason: 'unsupported appended barrel export' };
  return { lines, nodes };
}

function appendedName(line, node) {
  const match = APPEND.exec(line);
  if (
    !match ||
    !ts.isExportDeclaration(node) ||
    node.exportClause ||
    node.attributes ||
    node.isTypeOnly ||
    node.moduleSpecifier?.text !== `./${match[1]}`
  )
    return null;
  return match[1];
}

function appendedTargets(before, after, accumulated) {
  const { lines, nodes, reason } = appendedExports(before, after);
  if (reason) return { reason };
  const existing = accumulated ? before.reachable : before.files;
  const added = new Set();
  for (const [index, line] of lines.entries()) {
    const name = appendedName(line, nodes[index]);
    if (!name) return { reason: 'unsupported appended barrel export' };
    const stem = `${SCHEMA_DIR}${name}`;
    const file = `${stem}.ts`;
    const problem = moduleProblem(after, file, 'new module');
    if (problem) return { reason: problem };
    if (added.has(file) || existing.has(file))
      return { reason: `new module already present ${file}` };
    const resolution = after.inventory.resolveSpecifier(BARREL, `./${name}`);
    if (!same(resolution.files, [file]) || hasParallelTarget(after.files, stem, file))
      return { reason: `ambiguous appended target ${file}` };
    added.add(file);
  }
  return { added: [...added] };
}

function moduleSpecifier(node) {
  if (node.moduleSpecifier) return node.moduleSpecifier;
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
    return node.moduleReference.expression;
  return null;
}

function initialization(walk, tree, key, prior) {
  const ordered = new Set();
  const stack = new Set();
  let newCycle = false;
  function visit(file) {
    if (stack.has(file) && [...stack].some(member => !prior.has(member))) newCycle = true;
    if (ordered.has(file)) return;
    ordered.add(file);
    stack.add(file);
    const source = tree.graph.sourceFileOf(file);
    for (const node of source?.statements ?? []) {
      const specifier = moduleSpecifier(node);
      if (
        !specifier ||
        !ts.isStringLiteral(specifier) ||
        node.isTypeOnly ||
        node.importClause?.isTypeOnly
      )
        continue;
      for (const target of tree.graph.resolveSpecifier(file, specifier.text).files)
        if (walk.seen.has(target)) visit(target);
    }
    stack.delete(file);
  }
  visit(key.split('#')[0]);
  return { ordered: [...ordered].filter(file => prior.has(file)), newCycle };
}

function closureEdgesProblem(left, right, transition) {
  if (left.problems.length || right.problems.length)
    return `kernel closure incomplete ${left.problems[0] ?? right.problems[0]}`;
  for (const [file, edges] of left.resolutions) {
    const next = right.resolutions.get(file);
    if (!next) return `kernel edge changed ${file}`;
    const retained =
      file === transition?.import[0]
        ? next.filter(edge => !isRateBookImport(edge, transition.import))
        : next;
    if (!same(edges, file === BARREL ? retained.slice(0, edges.length) : retained))
      return `kernel edge changed ${file}`;
  }
  return null;
}

function closureProblem(before, after, added, transition) {
  const targets = new Set(added);
  for (const [key, left] of before.walks) {
    const right = after.walks.get(key);
    const problem = closureEdgesProblem(left, right, transition);
    if (problem) return problem;
    const extra = [...right.seen].filter(file => !left.seen.has(file));
    if (extra.length !== targets.size || extra.some(file => !targets.has(file)))
      return `unexpected kernel module for ${key}`;
    const { ordered, newCycle } = initialization(right, after, key, left.seen);
    if (newCycle) return `new kernel initialization cycle for ${key}`;
    if (!same(ordered, initialization(left, before, key, left.seen).ordered))
      return `kernel initialization order changed for ${key}`;
  }
  return null;
}

function retainedKernelProblem(before, after, transition) {
  for (const file of before.reachable) {
    if (
      file !== BARREL &&
      !transition?.retainedChanges.has(file) &&
      before.sources.get(file) !== after.sources.get(file)
    )
      return `changed kernel module ${file}`;
    if (!after.sources.has(file) || after.graph.sourceFileOf(file).parseDiagnostics.length)
      return `unparseable kernel module ${file}`;
  }
  return null;
}

function compare(before, after, anchor, role, inventoryOf, record, rateBook) {
  const reject = reason => `${role}: ${reason}`;
  const accumulated = role === 'base' || role === 'next base';
  const transition = rateBookTransition(before, after, accumulated, rateBook);
  const retained = retainedKernelProblem(before, after, transition);
  if (retained) return reject(retained);
  const { reason, added } = appendedTargets(before, after, accumulated);
  if (reason) return reject(reason);
  const closure = closureProblem(before, after, added, transition);
  if (closure) return reject(closure);
  if (after.resolution.violations.length)
    return reject(`unmodeled resolver input ${after.resolution.violations[0].file}`);
  const resolver = resolverComparison(before, after, accumulated, record);
  if (resolver) return reject(resolver);
  const oldInventory = inventoryOf(before, accumulated ? 'anchor' : 'base');
  const newInventory = inventoryOf(after, role);
  if (oldInventory.reason || newInventory.reason) return oldInventory.reason ?? newInventory.reason;
  if (added.length === 0 && before.reachable.size === anchor.reachable.size) return null;
  const provenance = provenanceProblem(before, after);
  if (provenance) return reject(provenance);
  const destructuring = schemaDestructuringExports(after, newInventory).next().value;
  if (destructuring)
    return reject(`schema destructuring export ${destructuring.getSourceFile().fileName}`);
  if (newInventory.outsideForwards.length)
    return reject(`schema forward outside scan roots ${newInventory.outsideForwards[0]}`);
  const additions = tableAdmissionProblem(
    before,
    after,
    anchor,
    added,
    accumulated,
    oldInventory,
    newInventory,
    transition
  );
  return additions ? reject(additions) : null;
}

function checkoutProblem(candidate, scanGraph, sources) {
  for (const file of new Set([...sources.keys(), ...candidate.sources.keys()]))
    if (sources.get(file) !== candidate.sources.get(file))
      return `candidate: checkout differs from merge blob ${file}`;
  for (const [key, walk] of candidate.walks)
    if (!same([...walk.resolutions], [...kernelWalk(scanGraph, key).resolutions]))
      return `candidate: checkout resolver differs for ${key}`;
  return null;
}

/** One proof result governs all three entries. Any failure leaves their exact digest in force. */
export function proveSchemaAdmission(
  input,
  pins,
  scanGraph,
  sources,
  record,
  transitionRecord = RATE_BOOK_TRANSITION
) {
  const fail = reason => ({ version: 2, ok: false, reason });
  if (input?.reason) return fail(input.reason);
  const recordProblem = resolverRecordProblem(record);
  if (recordProblem) return fail(recordProblem);
  const rateBook = parseRateBookTransition(transitionRecord);
  if (rateBook.reason) return fail(rateBook.reason);
  const anchor = image(input?.anchor, 'anchor');
  if (anchor.reason) return fail(anchor.reason);
  const base = image(input?.base, 'base');
  if (base.reason) return fail(base.reason);
  const candidate = image(input?.candidate, 'candidate');
  if (candidate.reason) return fail(candidate.reason);
  if (
    pins?.size !== LEGACY.size ||
    [...anchor.walks].some(([key, walk]) => pins.get(key) !== walk.versioned)
  )
    return fail('anchor: v2 kernel digest mismatch');
  const inventories = new Map();
  const inventoryOf = (tree, role) => {
    if (!inventories.has(tree.allSources))
      inventories.set(tree.allSources, forwardInventory(tree, 'inventory'));
    const inventory = inventories.get(tree.allSources);
    return inventory.reason
      ? { reason: inventory.reason.replace(/^inventory:/u, `${role}:`) }
      : inventory;
  };
  const reason =
    compare(anchor, base, anchor, 'base', inventoryOf, record, rateBook) ??
    compare(base, candidate, anchor, 'candidate', inventoryOf, record, rateBook) ??
    // Once the rate-book successor lands, the candidate must also pass the next base proof.
    (rateBookTransition(anchor, base, true, rateBook) &&
      compare(anchor, candidate, anchor, 'next base', inventoryOf, record, rateBook)) ??
    checkoutProblem(candidate, scanGraph, sources);
  if (reason) return fail(reason);
  return { version: 2, ok: true, reason: 'anchor and protected base verified' };
}
