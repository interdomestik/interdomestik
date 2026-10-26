import ts from 'typescript';
import { createHash } from 'node:crypto';
import { notificationModule, sourceClause, reject } from './db-access-m4-notification-ast.mjs';
import { NOTIFIER_CONTRACT } from './db-access-m4-notifier-contract.mjs';
import { NOTIFICATION_RUNTIME_CONTRACT } from './db-access-m4-notification-runtime-contract.mjs';
export const FILES = Object.freeze({
  notifier: 'apps/web/src/server/operations/m4-assignment-postcommit.ts',
  notificationRuntime: 'apps/web/src/server/operations/m4-notification-runtime.ts',
});
const digest = text => createHash('sha256').update(text).digest('hex');
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const variable = name => (n, s) =>
  ts.isVariableDeclaration(n) && n.initializer && n.name.getText(s) === name;
const statement = text => (n, s) => ts.isExpressionStatement(n) && n.getText(s) === text;
const guard = text => (n, s) => ts.isIfStatement(n) && n.expression.getText(s).includes(text);
const functionNamed = name => n => ts.isFunctionDeclaration(n) && n.name?.text === name;
const returned = text => (n, s) =>
  ts.isReturnStatement(n) && n.expression?.getText(s).includes(text);
function group(module, entries) {
  const facts = entries.map(([name, selector]) => {
    const expected = sourceClause(module.expected, name, selector),
      tree = JSON.stringify(expected.tree);
    return sourceClause(
      module,
      name,
      n =>
        ts.SyntaxKind[n.kind] === expected.kind &&
        module.observed.has(n) &&
        JSON.stringify(module.observed.get(n)) === tree
    );
  });
  if (facts.some((fact, index) => index && fact.start <= facts[index - 1].start))
    reject('ordered clause group');
  return facts;
}
function matched(source, contract, file) {
  const actual = notificationModule(source, file),
    expected = notificationModule(contract, file);
  if (JSON.stringify(actual.runtimeTree) !== JSON.stringify(expected.runtimeTree))
    reject(file + ': fixed imports/control/effects');
  return { ...actual, expected };
}
export function deriveM4AssignmentNotification({ notifierSource, notificationRuntimeSource }) {
  const notifier = matched(notifierSource, NOTIFIER_CONTRACT, FILES.notifier);
  const owner = matched(
    notificationRuntimeSource,
    NOTIFICATION_RUNTIME_CONTRACT,
    FILES.notificationRuntime
  );
  const namedOrderedFacts = {
    adapter: group(notifier, [
      ['capture-private-identity-before-await', variable('identity')],
      ['identity-shape-and-two-literal-entries', guard('identity.operationId')],
      ['acquire-owned-purpose-only', statement('owned = await openOwnedPurposeDatabase();')],
      ['await-fixed-store-transaction-return', variable('effect')],
      ['await-owned-db-close-before-delivery', statement('await owned.close();')],
      ['snapshot-purpose-delivery-eligibility', variable('deliveryAllowed')],
      ['stop-suppresses-provider-start', guard('!deliveryAllowed')],
      [
        'no-new-insert-suppresses-provider-start',
        (n, s) => ts.isIfStatement(n) && n.expression.getText(s) === '!effect',
      ],
      ['no-verified-email-suppresses-provider-start', guard('!effect.deliver')],
      ['invoke-private-effect-after-commit-and-close', variable('sent')],
    ]),
    store: group(notifier, [
      [
        'transaction-local-rls-and-tenant-gucs',
        (n, s) =>
          ts.isExpressionStatement(n) &&
          n.getText(s).startsWith('await tx.execute(sql`select set_config'),
      ],
      ['operation-and-tenant-ledger-read-share-lock', variable('[ledger]')],
      ['fixed-seven-field-fingerprint', variable('fingerprint')],
      ['durable-actor-claim-command-version-fingerprint-gate', guard('ledger.requestFingerprint')],
      ['exact-success-envelope-gate', guard('Object.keys(response).length')],
      ['successful-legacy-result-admin-change-gate', guard('Object.keys(result).length')],
      ['current-claim-tenant-assignee-share-lock', variable('[claim]')],
      ['absent-current-claim-refused', guard('!claim')],
      ['current-staff-tenant-role-and-email-share-lock', variable('[staff]')],
      ['absent-current-staff-refused', guard('!staff')],
      ['deterministic-fixed-notification-conflict-returning', variable('[inserted]')],
      ['only-actual-new-insert-creates-effect', guard('!inserted')],
      ['current-verified-email-gate', variable('email')],
      ['fresh-current-claim-content', variable('frozenClaim')],
      ['fresh-current-staff-name', variable('staffName')],
      ['private-fixed-email-closure-only', returned('sendClaimAssignedEmail')],
    ]),
    owner: group(owner, [
      [
        'capture-owned-endpoint-primitives',
        variable('{ databaseURL, deadlineMs: deadline, loopbackQualification }'),
      ],
      ['validate-captured-target', variable('notificationTarget')],
      ['explicit-integer-db-deadline', guard('Number.isSafeInteger')],
      ['owned-active-task-set', variable('activeNotificationDatabases')],
      ['fixed-owned-opener', functionNamed('openNotificationPurposeDatabase')],
      ['closed-or-four-task-quota-refuses-no-queue', guard('activeNotificationDatabases.size')],
      ['owned-task-done-marker', variable('done')],
      ['memoized-force-pool-termination', functionNamed('endOwnedPool')],
      ['stop-marks-before-termination-without-finishing', variable('operation')],
      ['register-before-timer-and-pool', statement('activeNotificationDatabases.add(operation);')],
      ['independent-notification-db-timer', variable('timer')],
      ['close-awaits-end-before-removing-owned-task', functionNamed('closeOwnedDatabase')],
      ['environment-check-before-driver-create', statement('assertM4DriverEnvironment();')],
      [
        'fixed-one-connection-tls-and-db-timeout-options',
        (n, s) => ts.isExpressionStatement(n) && n.getText(s).startsWith('pool = postgres('),
      ],
      [
        'await-actual-purpose-posture-before-store',
        statement('await assertM4PoolPosture(pool, notificationTarget);'),
      ],
      ['closed-or-stopped-startup-refused', guard('closed || stopped')],
      ['only-fixed-db-close-and-live-delivery-getter', returned('database: drizzle')],
      [
        'startup-failure-awaits-owned-cleanup',
        statement('await closeOwnedDatabase().catch(() => undefined);'),
      ],
      ['owner-close-stops-and-awaits-db-tasks', functionNamed('close')],
      [
        'fixed-frozen-owner-capability',
        returned('Object.freeze({ open: openNotificationPurposeDatabase, close })'),
      ],
    ]),
  };
  const facts = {
    notifierTree: notifier.runtimeTree,
    notificationRuntimeTree: owner.runtimeTree,
    namedOrderedFacts,
  };
  return freeze({
    version: 1,
    sourcePremiseOnly: true,
    runtimeAdmission: false,
    nativeAdmission: false,
    allExecutableContextsQualified: false,
    productionEventAuthenticated: false,
    sourceSha256: {
      [FILES.notifier]: digest(notifierSource),
      [FILES.notificationRuntime]: digest(notificationRuntimeSource),
    },
    facts,
    namedOrderedFacts,
    factsSha256: digest(JSON.stringify(facts)),
    sourceNodes: Object.entries(namedOrderedFacts).flatMap(([groupName, clauses]) =>
      clauses.map(c => ({
        group: groupName,
        file: groupName === 'owner' ? FILES.notificationRuntime : FILES.notifier,
        name: c.name,
        start: c.start,
        end: c.end,
        line: c.line,
        kind: c.kind,
      }))
    ),
    guarantees: [
      'Fixed imports and complete ordered runtime AST match independent reviewed contracts; no extra executable statement or alternate effect is admitted.',
      'Private identity captured before await, fixed legacy operation fingerprint and durable success gate precede tenant/current-claim/eligible-staff locked reads.',
      'Exact deterministic assignment notice fields; only a newly returned INSERT row permits a private current verified-email closure.',
      'Await store transaction return and DB close before checking live delivery eligibility and invoking the fixed email helper; failures do not escape as assignment rollback claims.',
      'Separate max-four owned DB task set, captured deadline/target, fixed driver options, environment and posture checks, memoized force termination and completion tracking; no queue or automatic retry.',
      'Owner close stops registered DB tasks and waits their done markers; termination failure is surfaced instead of clean-termination success.',
    ],
    premises: [
      'Actual private controller/bootstrap must supply only initial committed non-replayed legacy receipt and the concrete restricted opener. Types and factories do not authenticate a caller DTO.',
      'Distinct-purpose login, endpoint comparison and fixed local-versus-production constructor binding remain top-level bootstrap derivations; this owner cannot prove these surrounding bindings alone.',
      'Imported schema/Drizzle/crypto/email/posture/driver and unmodified JS intrinsics/loader closure must match the protected source and installed dependency image.',
      'Actual transaction return means successful commit only under qualified driver/database semantics; RLS, minimal role grants including FOR SHARE locks, concurrent conflict and timeout termination require real evidence.',
      'Verified-email authority is a locked current-row snapshot, not permanent address ownership after commit. Legacy assignment notification does not grant staff detail-page visibility.',
      'Already-started email is uncancellable and has no qualified absolute deadline; it is outside DB owner-close waiting and DB task quota. No delivery, outbox, retries or universal exactly-once guarantee.',
      'No assignment generation/ABA exclusion is established. No native admission, all-context proof, baseline exemption or accepted identity reduction follows from this derivation.',
    ],
  });
}
