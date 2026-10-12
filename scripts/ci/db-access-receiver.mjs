import ts from 'typescript';
import { unwrap } from './db-access-source.mjs';

export const PROVEN_DB_RECEIVER = 'proven-db';
export const PROVEN_NON_DB_RECEIVER = 'proven-non-db';
export const UNKNOWN_RECEIVER = 'unknown';

const DB_IDENTITIES = new Set(['db', 'dbRls', 'dbAdmin', 'tenant-context']);
// The source model intentionally has no standard-library types. This constructor is instead
// admitted through exact lexical evidence: an unshadowed direct global construction in the same
// source file, with no executable use that could replace or expose the constructor/prototype.
const SEALED_NON_DB_CONSTRUCTORS = new Set(['URLSearchParams']);
const stabilityBySource = new WeakMap();

function isTypeOnlyUse(node) {
  for (let current = node.parent; current && !ts.isSourceFile(current); current = current.parent)
    if (
      ts.isTypeNode(current) ||
      ts.isImportDeclaration(current) ||
      ts.isExportDeclaration(current)
    )
      return true;
  return false;
}

function stableGlobalConstructor(model, constructor) {
  if (
    !ts.isIdentifier(constructor) ||
    !SEALED_NON_DB_CONSTRUCTORS.has(constructor.text) ||
    model.declaration(constructor) ||
    model.rawDeclaration(constructor)
  )
    return false;
  const source = constructor.getSourceFile();
  let byName = stabilityBySource.get(source);
  if (!byName) {
    byName = new Map();
    stabilityBySource.set(source, byName);
  }
  if (byName.has(constructor.text)) return byName.get(constructor.text);
  let stable = true;
  model.walk(source, node => {
    if (!stable || !ts.isIdentifier(node) || node.text !== constructor.text || isTypeOnlyUse(node))
      return;
    // The name alone is never proof. Every executable reference in this module must be the
    // constructor position of a direct `new`; aliases, reassignment and prototype exposure stay
    // unknown so the guard fails closed.
    if (
      model.declaration(node) ||
      model.rawDeclaration(node) ||
      !ts.isNewExpression(node.parent) ||
      node.parent.expression !== node
    )
      stable = false;
  });
  byName.set(constructor.text, stable);
  return stable;
}

function stableBuiltinInstance(model, provenance, raw, seen = new Set()) {
  const node = unwrap(raw);
  if (!node || seen.has(node) || seen.size > 64 || provenance.isMutated(node)) return false;
  seen = new Set(seen).add(node);
  if (ts.isNewExpression(node)) return stableGlobalConstructor(model, node.expression);
  const declaration = model.declaration(node);
  return Boolean(
    declaration &&
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer &&
    stableBuiltinInstance(model, provenance, declaration.initializer, seen)
  );
}

function sourceLocalReceiver(coverage) {
  return Boolean(
    coverage?.alternatives?.length &&
    coverage.alternatives.every(
      alternative =>
        alternative.kind === 'source-local' &&
        !alternative.unknown &&
        alternative.targets.length > 0
    )
  );
}

// Receiver proof is intentionally tri-state. A known DB capability always wins, then an unknown
// handle blocks non-DB proof. Source-local methods are non-DB receivers only because every target
// body remains graph-inspected; this classification never suppresses that traversal.
export function classifyReceiver(model, provenance, raw, coverage) {
  const node = unwrap(raw);
  if (!node) return UNKNOWN_RECEIVER;
  const identity = provenance.clientIdentity(node);
  const value = provenance.provenance(node);
  if (DB_IDENTITIES.has(identity) || DB_IDENTITIES.has(value)) return PROVEN_DB_RECEIVER;
  const handle = provenance.tenantHandle(node);
  if (handle === true) return PROVEN_DB_RECEIVER;
  if (handle === 'unknown') return UNKNOWN_RECEIVER;
  if (sourceLocalReceiver(coverage) || stableBuiltinInstance(model, provenance, node))
    return PROVEN_NON_DB_RECEIVER;
  return UNKNOWN_RECEIVER;
}

export function isDirectNonOptionalCall(member, call) {
  return Boolean(
    call &&
    ts.isCallExpression(call) &&
    unwrap(call.expression) === member &&
    !member.questionDotToken &&
    !call.questionDotToken
  );
}
