// U2-e: evaluates the deployed app's secret-free runtime observation against the reviewed staging
// expectation and the exact release's migration journal. Pure: no I/O, no environment reads.
// Every failure is a fixed code; a receipt passes only with no codes.

const ROLE_NAME = /^[a-z_][\d_a-z]{0,62}$/u;
const HEX64 = /^[\da-f]{64}$/u;

export const FAILURE_CODES = Object.freeze([
  'MALFORMED_OBSERVATION',
  'CHALLENGE_MISMATCH',
  'COMMIT_MISMATCH',
  'SESSION_USER_MISMATCH',
  'CURRENT_USER_MISMATCH',
  'CONFIGURED_ROLE_PRESENT',
  'ROLE_CANNOT_LOGIN',
  'ROLE_PRIVILEGED_ATTRIBUTE',
  'REACHABLE_ROLE_UNEXPECTED',
  'REACHABLE_ROLE_PRIVILEGED',
  'MEMBERSHIP_ADMIN_OPTION',
  'OWNS_OBJECTS',
  'DANGEROUS_DATABASE_PRIVILEGE',
  'UNSAFE_ROLE_SETTING',
  'BACKEND_MARKER_UNAVAILABLE',
  'BACKEND_MARKER_MISMATCH',
  'LEDGER_UNREADABLE',
  'LEDGER_MISMATCH',
]);

const PRIVILEGED_ATTRIBUTES = [
  'rolsuper',
  'rolbypassrls',
  'rolcreatedb',
  'rolcreaterole',
  'rolreplication',
];
// Role defaults that change identity, RLS enforcement or what the session may load.
const UNSAFE_SETTINGS =
  /^(role|session_authorization|row_security|search_path|session_preload_libraries|local_preload_libraries)=/iu;

const isBool = value => typeof value === 'boolean';
const isRole = value => typeof value === 'string' && ROLE_NAME.test(value);

function wellFormedRole(role) {
  return (
    role !== null &&
    typeof role === 'object' &&
    isRole(role.name) &&
    ['rolcanlogin', 'rolinherit', ...PRIVILEGED_ATTRIBUTES].every(key => isBool(role[key]))
  );
}

function wellFormedEdge(edge) {
  return (
    edge !== null &&
    typeof edge === 'object' &&
    isRole(edge.member) &&
    isRole(edge.role) &&
    isBool(edge.adminOption)
  );
}

function wellFormedLedger(ledger) {
  return (
    ledger === null ||
    (Array.isArray(ledger) &&
      ledger.every(
        row =>
          row && HEX64.test(row.hash) && Number.isSafeInteger(row.createdAt) && row.createdAt > 0
      ))
  );
}

/** Whether every field the evaluation reads has the exact expected shape. */
export function isWellFormedObservation(observation) {
  const o = observation;
  return Boolean(
    o &&
    typeof o === 'object' &&
    typeof o.challenge === 'string' &&
    typeof o.commitSha === 'string' &&
    isRole(o.sessionUser) &&
    isRole(o.currentUser) &&
    (o.configuredRole === null || typeof o.configuredRole === 'string') &&
    Number.isSafeInteger(o.serverVersionNum) &&
    wellFormedRole(o.login) &&
    Array.isArray(o.reachableRoles) &&
    o.reachableRoles.every(wellFormedRole) &&
    Array.isArray(o.memberships) &&
    o.memberships.every(wellFormedEdge) &&
    Number.isSafeInteger(o.ownedObjectCount) &&
    o.ownedObjectCount >= 0 &&
    Array.isArray(o.databasePrivileges) &&
    o.databasePrivileges.every(p => typeof p === 'string') &&
    Array.isArray(o.roleSettings) &&
    o.roleSettings.every(s => typeof s === 'string') &&
    Array.isArray(o.effectiveSettings) &&
    o.effectiveSettings.every(s => typeof s === 'string') &&
    (o.backendMarker === null || typeof o.backendMarker === 'string') &&
    wellFormedLedger(o.migrationLedger)
  );
}

/** Roles reachable from `start` through any membership edge, whatever its options. */
export function reachableFrom(start, memberships) {
  const seen = new Set();
  const queue = [start];
  while (queue.length > 0) {
    const member = queue.shift();
    for (const edge of memberships) {
      if (edge.member !== member || seen.has(edge.role)) continue;
      seen.add(edge.role);
      queue.push(edge.role);
    }
  }
  seen.delete(start);
  return seen;
}

function identityCodes(o, expectation, request) {
  const codes = [];
  if (o.challenge !== request.challenge) codes.push('CHALLENGE_MISMATCH');
  if (o.commitSha !== request.commitSha) codes.push('COMMIT_MISMATCH');
  if (o.sessionUser !== expectation.loginRole) codes.push('SESSION_USER_MISMATCH');
  if (o.currentUser !== o.sessionUser) codes.push('CURRENT_USER_MISMATCH');
  if (o.configuredRole !== null) codes.push('CONFIGURED_ROLE_PRESENT');
  if (o.login.name !== o.sessionUser || !o.login.rolcanlogin) codes.push('ROLE_CANNOT_LOGIN');
  if (PRIVILEGED_ATTRIBUTES.some(key => o.login[key])) codes.push('ROLE_PRIVILEGED_ATTRIBUTE');
  return codes;
}

function authorityCodes(o, expectation) {
  const codes = [];
  const reachable = reachableFrom(o.sessionUser, o.memberships);
  const allowed = new Set(expectation.allowedReachableRoles);
  if ([...reachable].some(role => !allowed.has(role))) codes.push('REACHABLE_ROLE_UNEXPECTED');
  // Every reachable role must be described, and none may carry a privileged attribute.
  const described = new Map(o.reachableRoles.map(role => [role.name, role]));
  const privileged = [...reachable].some(name => {
    const role = described.get(name);
    return !role || PRIVILEGED_ATTRIBUTES.some(key => role[key]);
  });
  if (privileged) codes.push('REACHABLE_ROLE_PRIVILEGED');
  const reachableOrSelf = new Set([o.sessionUser, ...reachable]);
  if (o.memberships.some(edge => edge.adminOption && reachableOrSelf.has(edge.member)))
    codes.push('MEMBERSHIP_ADMIN_OPTION');
  if (o.ownedObjectCount > 0) codes.push('OWNS_OBJECTS');
  if (o.databasePrivileges.some(p => p.toUpperCase() === 'CREATE'))
    codes.push('DANGEROUS_DATABASE_PRIVILEGE');
  // A persisted default or the effective session value (default: on): row_security must stay on.
  const effectiveOff = o.effectiveSettings.some(s => /^row_security=(?!on$)/iu.test(s));
  if (o.roleSettings.some(setting => UNSAFE_SETTINGS.test(setting)) || effectiveOff)
    codes.push('UNSAFE_ROLE_SETTING');
  return codes;
}

function backendCodes(o, expectation) {
  if (o.backendMarker === null || expectation.backendMarker === null)
    return ['BACKEND_MARKER_UNAVAILABLE'];
  return o.backendMarker === expectation.backendMarker ? [] : ['BACKEND_MARKER_MISMATCH'];
}

/** The ledger must equal the journal exactly: same rows, same order, same hashes and times. */
function ledgerCodes(o, journal) {
  if (o.migrationLedger === null) return ['LEDGER_UNREADABLE'];
  const ledger = o.migrationLedger;
  const same =
    ledger.length === journal.length &&
    journal.every(
      (entry, index) => ledger[index].hash === entry.hash && ledger[index].createdAt === entry.when
    );
  return same ? [] : ['LEDGER_MISMATCH'];
}

/**
 * Evaluates one observation. `expectation` is the reviewed staging expectation, `journal` the exact
 * release's ordered migration entries ({ tag, when, hash }), `request` what the collector sent.
 */
export function evaluateObservation(observation, { expectation, journal, request }) {
  if (!isWellFormedObservation(observation))
    return { ok: false, failureCodes: ['MALFORMED_OBSERVATION'] };
  const failureCodes = [
    ...identityCodes(observation, expectation, request),
    ...authorityCodes(observation, expectation),
    ...backendCodes(observation, expectation),
    ...ledgerCodes(observation, journal),
  ];
  return { ok: failureCodes.length === 0, failureCodes };
}
