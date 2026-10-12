import { unwrap } from './db-access-source.mjs';

export const PROVEN_DB_RECEIVER = 'proven-db';
export const UNKNOWN_RECEIVER = 'unknown';

const DB_IDENTITIES = new Set(['db', 'dbRls', 'dbAdmin', 'tenant-context']);

// Receiver proof is intentionally tri-state. A known DB capability always wins, then an unknown
// handle blocks non-DB proof. Source-local dispatch proves which bodies need graph traversal, but
// JavaScript prototype, setter and deletion effects prevent it from proving receiver identity.
export function classifyReceiver(_model, provenance, raw, _coverage) {
  const node = unwrap(raw);
  if (!node) return UNKNOWN_RECEIVER;
  const identity = provenance.clientIdentity(node);
  const value = provenance.provenance(node);
  if (DB_IDENTITIES.has(identity) || DB_IDENTITIES.has(value)) return PROVEN_DB_RECEIVER;
  const handle = provenance.tenantHandle(node);
  if (handle === true) return PROVEN_DB_RECEIVER;
  if (handle === 'unknown') return UNKNOWN_RECEIVER;
  return UNKNOWN_RECEIVER;
}
