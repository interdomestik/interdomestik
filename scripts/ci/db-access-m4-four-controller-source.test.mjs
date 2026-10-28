import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { TRANSACTION_CASES } from './db-access-m4-four-controller-transaction-cases.fixture.mjs';
import { INGRESS_CASES } from './db-access-m4-four-controller-ingress-cases.fixture.mjs';
import { PRIOR_NEGATIVE_FAMILIES } from './db-access-m4-four-controller-contract.mjs';
import {
  registerPositiveControllerCases,
  replace,
  mutateNode,
  transactionStatement,
  insertStatement,
  negative,
} from './db-access-m4-four-controller-test.fixture.mjs';
registerPositiveControllerCases();
const prior = [...TRANSACTION_CASES, ...INGRESS_CASES];
assert.equal(prior.length, 49);
assert.deepEqual(
  new Set(prior.map(x => x[0])),
  new Set(PRIOR_NEGATIVE_FAMILIES),
  'all existing 49 families preserved exactly'
);
for (const [label, mutate, key] of prior) negative(label, mutate, key);
const added = [
  [
    'ops unexpectedly reads branch column',
    s =>
      replace(
        s,
        "profile === 'ops' ? sql<string | null>`null` : schema.user.branchId",
        'schema.user.branchId'
      ),
  ],
  [
    'legacy and staff current branch read removed',
    s =>
      replace(
        s,
        "profile === 'ops' ? sql<string | null>`null` : schema.user.branchId",
        'sql<string | null>`null`'
      ),
  ],
  [
    'notification before result commit',
    s =>
      transactionStatement(
        s,
        insertStatement,
        (n, a) => 'if (notification) await assignmentNotifier!(notification); ' + n.getText(a)
      ),
  ],
  [
    'literal ops factory binding changed',
    s =>
      replace(
        s,
        "createPrivateAssignmentController(configuration, 'ops')",
        "createPrivateAssignmentController(configuration, 'staff')"
      ),
  ],
  [
    'legacy factory profile selected from configuration',
    s =>
      replace(
        s,
        "    'legacy-admin',\n    configuration.assignmentNotifier",
        '    configuration.profile,\n    configuration.assignmentNotifier'
      ),
  ],
  [
    'legacy notifier capture omitted',
    s =>
      replace(s, "    'legacy-admin',\n    configuration.assignmentNotifier", "    'legacy-admin'"),
  ],
  [
    'legacy missing notifier gate removed',
    s =>
      transactionStatement(
        s,
        (t, n) => ts.isIfStatement(n) && t.includes('Missing private assignment notifier'),
        ''
      ),
  ],
  [
    'current branch replaced by old principal',
    s => replace(s, 'actor.branchId ?? null', 'principal.branchId ?? null'),
  ],
  [
    'legacy home resource gate omitted',
    s =>
      mutateNode(
        s,
        (n, a) =>
          ts.isConditionalExpression(n) &&
          n.getText(a).includes('eq(schema.claims.tenantId, principal.tenantId)'),
        'undefined'
      ),
  ],
  [
    'current staff resource scope omitted',
    s =>
      mutateNode(
        s,
        (n, a) =>
          ts.isConditionalExpression(n) && n.whenTrue.getText(a).startsWith('staffResourceScope('),
        'undefined'
      ),
  ],
  [
    'legacy current self authority before replay omitted',
    s =>
      transactionStatement(
        s,
        (t, n) => ts.isIfStatement(n) && t.includes('SELF_ASSIGNMENT_ONLY'),
        ''
      ),
  ],
  [
    'legacy alias fingerprint identity omitted',
    s => mutateNode(s, n => ts.isSpreadElement(n), '...[]'),
  ],
  [
    'ops fingerprint compatibility broken',
    s => mutateNode(s, n => ts.isSpreadElement(n), '...[profile]'),
  ],
  [
    'staff default conflates explicit null',
    s => replace(s, 'request.staffId === undefined', 'request.staffId == null'),
  ],
  [
    'profile replay response unvalidated',
    s =>
      replace(
        s,
        "storedProfileOutcome(previous.response, profile !== 'staff')",
        'previous.response as any'
      ),
  ],
  [
    'private notification receipt becomes caller data',
    s =>
      mutateNode(
        s,
        (n, a) => ts.isBinaryExpression(n) && n.left.getText(a) === 'notification',
        (n, a) => 'notification = serializedObservation as any'
      ),
  ],
  [
    'notifier replaced by fake success',
    s => replace(s, 'assignmentNotifier!(committedNotification)', 'Promise.resolve()'),
  ],
  ['notification dispatched on replay', s => replace(s, '!response.replayed', 'true')],
  [
    'notification dispatched on domain denial',
    s => replace(s, 'response.result.success &&', 'true &&'),
  ],
  [
    'notification entry identity wrong',
    s => replace(s, 'entry: profile,', "entry: 'legacy-admin',"),
  ],
  [
    'notification reference contains private email',
    s => replace(s, 'entry: profile,', 'entry: profile, email: assignedLegacy.notification.email,'),
  ],
  [
    'unbounded observation ip accepted',
    s => replace(s, 'row.ip.length > 256', 'row.ip.length > 999999'),
    'wireSource',
  ],
  [
    'observation object accepted',
    s => replace(s, "typeof serialized !== 'string'", "typeof serialized === 'string'"),
    'wireSource',
  ],
  [
    'extra observation fields accepted',
    s => replace(s, "Object.keys(row).some(key => key !== 'ip' && key !== 'userAgent')", 'false'),
    'wireSource',
  ],
  [
    'arbitrary observation projection returned',
    s =>
      mutateNode(
        s,
        (n, a) => ts.isReturnStatement(n) && n.getText(a).startsWith('return Object.freeze('),
        'return row as any;'
      ),
    'wireSource',
  ],
  [
    'profile result data exposure allowed',
    s => replace(s, 'row.data !== undefined', 'false'),
    'wireSource',
  ],
  [
    'postcommit Promise global shadowed',
    s =>
      replace(
        s,
        'const { database, verifySession } = configuration;',
        'const { database, verifySession } = configuration; const Promise = configuration;'
      ),
  ],
];
for (const [label, mutate, key] of added) negative(label, mutate, key);
test('startup/unrelated exception cannot satisfy semantic rejection oracle', () => {
  assert.throws(
    () =>
      assert.throws(() => {
        throw new Error('synthetic dependency startup failure');
      }, /^Error: m4 controller source rejected:/),
    assert.AssertionError
  );
});

for (const key of ['controllerSource', 'protocolSource', 'wireSource'])
  negative(
    'empty value import in ' + key,
    source => "import {} from './unbound-helper';\n" + source,
    key
  );
