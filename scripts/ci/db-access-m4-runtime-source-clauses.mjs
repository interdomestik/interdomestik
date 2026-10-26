import ts from 'typescript';
import {
  clauses,
  variable as v,
  fn,
  statement as s,
  guard as g,
} from './db-access-m4-runtime-source-ast.mjs';
export function runtimeClauses(bootstrap, posture) {
  return {
    construction: clauses(bootstrap, [
      ['trusted-constructor-only', fn('construct')],
      [
        'snapshot-primitive-configuration',
        v(
          '{ identityDatabaseURL, dataDatabaseURL, issuerBaseURL, issuerSecret, operationDeadlineMs }'
        ),
      ],
      ['integer-deadline-required', g('Number.isSafeInteger(operationDeadlineMs)')],
      ['original-issuer-url-validated', v('issuer')],
      ['capture-identity-purpose-target', v('identityTarget')],
      ['capture-data-purpose-target', v('dataTarget')],
      ['distinct-purpose-same-endpoint', g('identityTarget.login === dataTarget.login')],
      ['capture-notification-target', v('notificationTarget')],
      ['distinct-notification-purpose-and-deadline', g('notificationTarget &&')],
      ['freeze-captured-primitives', v('captured')],
      ['private-owned-operation-set', v('active')],
      ['concrete-notification-owner', v('notificationOwner')],
      ['concrete-notifier-from-owned-opener', v('assignmentNotifier')],
    ]),
    operation: clauses(bootstrap, [
      ['fixed-profile-execution', fn('executeProfile')],
      ['parse-serialized-request', v('request')],
      ['command-observation-before-any-pool', g('!request ||')],
      ['uncertain-retains-operation-id', v('uncertain')],
      ['closed-or-four-refuses-without-queue', g('closed || active.size')],
      ['owned-done-marker', v('done')],
      ['deadline-result-promise', v('expiration')],
      ['memoized-only-owned-pool-termination', fn('endOwnedPools')],
      ['stop-marks-expires-terminates', v('operation')],
      ['register-before-timer-and-pool', s('active.add(operation);')],
      ['captured-business-deadline', v('timer')],
      ['owned-work-no-retry', v('work')],
      ['fixed-driver-connection-options', v('connection')],
      [
        'identity-pool-fixed-options',
        node => ts.isExpressionStatement(node) && node.getText().startsWith('identity = postgres('),
      ],
      [
        'data-pool-fixed-options',
        node => ts.isExpressionStatement(node) && node.getText().startsWith('data = postgres('),
      ],
      [
        'await-both-real-posture-gates',
        s(`await Promise.all([
          assertM4PoolPosture(identity, identityTarget),
          assertM4PoolPosture(data, dataTarget),
        ]);`),
      ],
      ['stop-before-verifier-binding', g('stopped')],
      ['real-current-store-identity-binding', v('verifySession')],
      ['real-data-controller-binding', v('configuration')],
      [
        'ops-literal-factory',
        node => ts.isIfStatement(node) && node.expression.getText() === "profile === 'ops'",
      ],
      [
        'staff-literal-factory',
        node => ts.isIfStatement(node) && node.expression.getText() === "profile === 'staff'",
      ],
      ['missing-notifier-fails-closed', g('!assignmentNotifier')],
      [
        'legacy-admin-concrete-notifier',
        node =>
          ts.isIfStatement(node) && node.expression.getText() === "profile === 'legacy-admin'",
      ],
      ['race-owned-work-with-expiration', v('result')],
      ['await-owned-pool-end', v('ended')],
      ['await-work-settlement-before-return', s('await work;')],
      ['remove-slot-only-in-finally', s('active.delete(operation);')],
      ['resolve-owned-completion', s('finish();')],
    ]),
    closure: clauses(bootstrap, [
      ['idempotent-close-stops-and-drains', fn('close')],
      ['private-ops-executor', v('execute')],
      ['ops-only-frozen-capability', g('!notificationTarget')],
      ['production-ops-fixed-tls-mode', fn('createM4PrivateRuntime')],
      ['local-ops-fixed-loopback-mode', fn('createM4LocalQualificationRuntime')],
      ['production-all-profiles-fixed-tls-mode', fn('createM4PrivateAssignmentRuntime')],
      ['local-all-profiles-fixed-loopback-mode', fn('createM4LocalQualificationAssignmentRuntime')],
    ]),
    posture: clauses(posture, [
      ['capture-and-validate-credential-target', fn('captureM4PoolTarget')],
      ['only-qualified-url-shapes', g("!['postgres:', 'postgresql:'].includes")],
      ['explicit-default-port-no-environment-port', s("url.port ||= '5432';")],
      ['reject-unqualified-driver-fallbacks', fn('assertM4DriverEnvironment')],
      ['exact-driver-environment-deny-list', v('options')],
      ['server-enforced-role-database-posture', fn('assertM4PoolPosture')],
      ['exact-sql-gate-and-two-target-parameters', v('rows')],
      ['exact-single-numeric-gate-required', g('rows.length !== 1')],
    ]),
  };
}
