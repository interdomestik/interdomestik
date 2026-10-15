import ts from 'typescript';
import { unwrap } from './db-access-source.mjs';

export const PROVEN_DB_RECEIVER = 'proven-db';
export const PROVEN_NON_DB_RECEIVER = 'proven-non-db';
export const UNKNOWN_RECEIVER = 'unknown';

const DB_IDENTITIES = new Set(['db', 'dbRls', 'dbAdmin', 'tenant-context']);

function localCollection(model, provenance, raw, seen = new Set()) {
  const node = unwrap(raw);
  if (!node || seen.has(node) || seen.size > 32 || provenance.isMutated(node)) return false;
  seen = new Set(seen).add(node);
  if (ts.isNewExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      ['Set', 'Map'].includes(node.expression.text) &&
      !model.declaration(node.expression) &&
      !node.arguments?.length
    );
  }
  const decl = model.declaration(node);
  return (
    !!decl &&
    ts.isVariableDeclaration(decl) &&
    ts.isVariableDeclarationList(decl.parent) &&
    !!(decl.parent.flags & ts.NodeFlags.Const) &&
    !!decl.initializer &&
    localCollection(model, provenance, decl.initializer, seen)
  );
}

// Receiver proof is intentionally tri-state. A known DB capability always wins, then an unknown
// handle blocks non-DB proof. Source-local dispatch proves which bodies need graph traversal, but
// JavaScript prototype, setter and deletion effects prevent it from proving receiver identity.
export function classifyReceiver(model, provenance, raw, _coverage) {
  const node = unwrap(raw);
  if (!node) return UNKNOWN_RECEIVER;
  const identity = provenance.clientIdentity(node);
  const value = provenance.provenance(node);
  if (DB_IDENTITIES.has(identity) || DB_IDENTITIES.has(value)) return PROVEN_DB_RECEIVER;
  const handle = provenance.tenantHandle(node);
  if (handle === true) return PROVEN_DB_RECEIVER;
  if (handle === 'unknown') return UNKNOWN_RECEIVER;
  if (localCollection(model, provenance, node)) return PROVEN_NON_DB_RECEIVER;
  return UNKNOWN_RECEIVER;
}
