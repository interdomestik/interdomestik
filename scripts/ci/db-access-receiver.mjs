import ts from 'typescript';
import { unwrap } from './db-access-source.mjs';

export const PROVEN_DB_RECEIVER = 'proven-db';
export const PROVEN_NON_DB_RECEIVER = 'proven-non-db';
export const UNKNOWN_RECEIVER = 'unknown';

const DB_IDENTITIES = new Set(['db', 'dbRls', 'dbAdmin', 'tenant-context']);

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
  if (sourceLocalReceiver(coverage)) return PROVEN_NON_DB_RECEIVER;
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
