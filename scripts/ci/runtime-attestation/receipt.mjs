import { createHash } from 'node:crypto';

// U2-e receipt: a versioned, allowlisted, secret-free record of one observation and its verdict.
// States: PASS (every check verified), INPUTS_NOT_PROVISIONED (only owner-provisioned inputs are
// missing: observer account, enrolled backend marker, ledger read access), FAIL (anything else).
// Only PASS succeeds, in either mode; the mode decides whether deployment acceptance depends on it.

export const RECEIPT_SCHEMA_VERSION = 'ida.u2e-runtime-receipt.v1';
export const MODES = Object.freeze(['observe', 'enforce']);

/** Codes that mean an owner-provisioned input is missing, not that observed authority drifted. */
export const INPUT_CODES = Object.freeze([
  'OBSERVER_ACCOUNT_UNPROVISIONED',
  'BACKEND_MARKER_UNAVAILABLE',
  'LEDGER_UNREADABLE',
]);

const sha256 = value => createHash('sha256').update(value).digest('hex');

export function classify(failureCodes) {
  if (failureCodes.length === 0) return 'PASS';
  return failureCodes.every(code => INPUT_CODES.includes(code)) ? 'INPUTS_NOT_PROVISIONED' : 'FAIL';
}

/** Only these observed facts are kept; the marker and ledger are reduced to digests. */
function observedFacts(o) {
  if (!o || typeof o !== 'object') return null;
  const ledger = Array.isArray(o.migrationLedger) ? o.migrationLedger : null;
  return {
    sessionUser: o.sessionUser ?? null,
    currentUser: o.currentUser ?? null,
    configuredRolePresent: o.configuredRole != null,
    serverVersionNum: o.serverVersionNum ?? null,
    login: o.login ?? null,
    reachableRoles: o.reachableRoles ?? null,
    memberships: o.memberships ?? null,
    ownedObjectCount: o.ownedObjectCount ?? null,
    databasePrivileges: o.databasePrivileges ?? null,
    roleSettingNames: Array.isArray(o.roleSettings)
      ? o.roleSettings.map(setting => String(setting).split('=')[0])
      : null,
    effectiveSettings: Array.isArray(o.effectiveSettings) ? o.effectiveSettings : null,
    backendMarkerSha256: typeof o.backendMarker === 'string' ? sha256(o.backendMarker) : null,
    ledgerCount: ledger ? ledger.length : null,
    ledgerSha256: ledger ? sha256(JSON.stringify(ledger)) : null,
  };
}

/**
 * Builds the receipt. `context` carries the run, deployment and expectation identities the collector
 * verified; `observation` is the app's response body (or null when none was obtained).
 */
export function buildReceipt({ mode, failureCodes, context, observation }) {
  if (!MODES.includes(mode)) throw new Error(`unknown runtime attestation mode: ${mode}`);
  const codes = [...new Set(failureCodes)].sort();
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    status: classify(codes),
    mode,
    failureCodes: codes,
    readOnly: true,
    scope: 'staging tenant client (dbRls) authority, backend and migration identity',
    expectationSha256: context.expectationSha256,
    journalSha256: context.journalSha256,
    expectedLedgerCount: context.expectedLedgerCount,
    challenge: context.challenge,
    observedAt: observation?.observedAt ?? null,
    collectedAt: context.collectedAt,
    runId: context.runId,
    runAttempt: context.runAttempt,
    deployment: context.deployment,
    observed: observedFacts(observation),
  };
}
