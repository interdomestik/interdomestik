import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateObservation, reachableFrom } from './runtime-attestation/evaluate.mjs';
import { readExpectedLedger } from './runtime-attestation/journal.mjs';

const LOGIN = 'interdomestik_runtime_rls';
const HASH = n => n.toString(16).padStart(64, '0');
const JOURNAL = [
  { tag: '0000_a', when: 1000, hash: HASH(1) },
  { tag: '0001_b', when: 2000, hash: HASH(2) },
];
const EXPECTATION = {
  loginRole: LOGIN,
  allowedReachableRoles: ['app_reader'],
  backendMarker: 'mk-1',
};
const REQUEST = { challenge: 'c'.repeat(43), commitSha: 'a'.repeat(40) };
const role = (name, extra = {}) => ({
  name,
  rolcanlogin: false,
  rolinherit: true,
  rolsuper: false,
  rolbypassrls: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  ...extra,
});

function observation(overrides = {}) {
  return {
    challenge: REQUEST.challenge,
    commitSha: REQUEST.commitSha,
    sessionUser: LOGIN,
    currentUser: LOGIN,
    configuredRole: null,
    serverVersionNum: 150008,
    login: role(LOGIN, { rolcanlogin: true }),
    reachableRoles: [role('app_reader')],
    memberships: [{ member: LOGIN, role: 'app_reader', adminOption: false }],
    ownedObjectCount: 0,
    databasePrivileges: ['CONNECT', 'TEMPORARY'],
    roleSettings: ['statement_timeout=30s'],
    effectiveSettings: ['client_min_messages=warning'],
    backendMarker: 'mk-1',
    migrationLedger: JOURNAL.map(entry => ({ hash: entry.hash, createdAt: entry.when })),
    ...overrides,
  };
}

const codesOf = overrides =>
  evaluateObservation(observation(overrides), {
    expectation: EXPECTATION,
    journal: JOURNAL,
    request: REQUEST,
  }).failureCodes;

test('U2-e: the intended restricted LOGIN with the exact catalogue and ledger passes', () => {
  assert.deepEqual(codesOf({}), []);
});

test('U2-e: identity drift is refused (wrong LOGIN, SET ROLE, configured role, replay)', () => {
  assert.deepEqual(codesOf({ sessionUser: 'postgres', currentUser: 'postgres' }), [
    'SESSION_USER_MISMATCH',
    'ROLE_CANNOT_LOGIN',
  ]);
  // A management LOGIN that switched to the runtime role still shows its own session_user.
  assert.ok(codesOf({ sessionUser: 'postgres' }).includes('SESSION_USER_MISMATCH'));
  assert.ok(codesOf({ currentUser: 'app_reader' }).includes('CURRENT_USER_MISMATCH'));
  assert.deepEqual(codesOf({ configuredRole: 'app_reader' }), ['CONFIGURED_ROLE_PRESENT']);
  assert.deepEqual(codesOf({ challenge: 'd'.repeat(43) }), ['CHALLENGE_MISMATCH']);
  assert.deepEqual(codesOf({ commitSha: 'b'.repeat(40) }), ['COMMIT_MISMATCH']);
  assert.deepEqual(codesOf({ login: role(LOGIN) }), ['ROLE_CANNOT_LOGIN']);
});

test('U2-e: every privileged attribute on the LOGIN is refused', () => {
  for (const key of [
    'rolsuper',
    'rolbypassrls',
    'rolcreatedb',
    'rolcreaterole',
    'rolreplication',
  ]) {
    const login = role(LOGIN, { rolcanlogin: true, [key]: true });
    assert.deepEqual(codesOf({ login }), ['ROLE_PRIVILEGED_ATTRIBUTE'], key);
  }
});

test('U2-e: reachable authority is followed transitively whatever the edge options', () => {
  const memberships = [
    { member: LOGIN, role: 'app_reader', adminOption: false },
    { member: 'app_reader', role: 'service_role', adminOption: false },
  ];
  assert.deepEqual([...reachableFrom(LOGIN, memberships)].sort(), ['app_reader', 'service_role']);
  const reachableRoles = [role('app_reader'), role('service_role', { rolbypassrls: true })];
  assert.deepEqual(codesOf({ memberships, reachableRoles }), [
    'REACHABLE_ROLE_UNEXPECTED',
    'REACHABLE_ROLE_PRIVILEGED',
  ]);
  // An undescribed reachable role is treated as privileged.
  assert.deepEqual(codesOf({ reachableRoles: [] }), ['REACHABLE_ROLE_PRIVILEGED']);
  const admin = [{ member: LOGIN, role: 'app_reader', adminOption: true }];
  assert.deepEqual(codesOf({ memberships: admin }), ['MEMBERSHIP_ADMIN_OPTION']);
  // A cycle terminates.
  const cycle = [
    ...memberships.slice(0, 1),
    { member: 'app_reader', role: LOGIN, adminOption: false },
  ];
  assert.deepEqual([...reachableFrom(LOGIN, cycle)], ['app_reader']);
});

test('U2-e: ownership, CREATE on the database and unsafe role defaults are refused', () => {
  assert.deepEqual(codesOf({ ownedObjectCount: 1 }), ['OWNS_OBJECTS']);
  assert.deepEqual(codesOf({ databasePrivileges: ['CONNECT', 'create'] }), [
    'DANGEROUS_DATABASE_PRIVILEGE',
  ]);
  for (const setting of [
    'role=postgres',
    'ROW_SECURITY=off',
    'search_path=evil',
    'session_authorization=x',
  ])
    assert.deepEqual(codesOf({ roleSettings: [setting] }), ['UNSAFE_ROLE_SETTING'], setting);
  // The effective value counts even when no persisted default explains it.
  assert.deepEqual(codesOf({ effectiveSettings: ['row_security=off'] }), ['UNSAFE_ROLE_SETTING']);
  assert.deepEqual(codesOf({ effectiveSettings: ['row_security=on'] }), []);
  assert.deepEqual(codesOf({ effectiveSettings: undefined }), ['MALFORMED_OBSERVATION']);
});

test('U2-e: a missing or different backend marker is refused', () => {
  assert.deepEqual(codesOf({ backendMarker: null }), ['BACKEND_MARKER_UNAVAILABLE']);
  assert.deepEqual(codesOf({ backendMarker: 'mk-2' }), ['BACKEND_MARKER_MISMATCH']);
  const unenrolled = evaluateObservation(observation(), {
    expectation: { ...EXPECTATION, backendMarker: null },
    journal: JOURNAL,
    request: REQUEST,
  });
  assert.deepEqual(unenrolled.failureCodes, ['BACKEND_MARKER_UNAVAILABLE']);
});

test('U2-e: the ledger must equal the journal exactly', () => {
  const ledger = JOURNAL.map(entry => ({ hash: entry.hash, createdAt: entry.when }));
  assert.deepEqual(codesOf({ migrationLedger: null }), ['LEDGER_UNREADABLE']);
  const variants = {
    missing: ledger.slice(0, 1),
    extra: [...ledger, { hash: HASH(3), createdAt: 3000 }],
    reordered: [...ledger].reverse(),
    duplicated: [ledger[0], ledger[0]],
    altered: [ledger[0], { ...ledger[1], hash: HASH(9) }],
    retimed: [ledger[0], { ...ledger[1], createdAt: 2001 }],
  };
  for (const [name, migrationLedger] of Object.entries(variants))
    assert.deepEqual(codesOf({ migrationLedger }), ['LEDGER_MISMATCH'], name);
});

test('U2-e: malformed, truncated or null observations fail closed', () => {
  const broken = [
    null,
    {},
    observation({ login: null }),
    observation({ sessionUser: 'Robert"); drop' }),
    observation({ memberships: [{ member: LOGIN }] }),
    observation({ ownedObjectCount: -1 }),
    observation({ migrationLedger: [{ hash: 'zz', createdAt: 1 }] }),
    observation({ login: { ...role(LOGIN), rolsuper: 'false' } }),
  ];
  for (const value of broken) {
    const result = evaluateObservation(value, {
      expectation: EXPECTATION,
      journal: JOURNAL,
      request: REQUEST,
    });
    assert.deepEqual(result, { ok: false, failureCodes: ['MALFORMED_OBSERVATION'] });
  }
});

test('U2-e: the expected ledger is derived from the release journal and SQL bytes', () => {
  const { journalSha256, entries } = readExpectedLedger(process.cwd());
  assert.match(journalSha256, /^[\da-f]{64}$/u);
  assert.ok(entries.length > 0);
  // Journal order is the ledger order (rows by id); `when` is not monotonic in this repository.
  assert.ok(entries.every(entry => /^[\da-f]{64}$/u.test(entry.hash)));
  assert.equal(new Set(entries.map(entry => entry.tag)).size, entries.length);
});
