import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { collectRbacFailures, shouldRetryP01FreshContext } = require('./p01-rbac-failures.ts');

const runCtx = { locale: 'en' };
const memberMatrix = { canonical: 'member', absentOnAllRoutes: ['agent', 'staff', 'admin'] };
const staffMatrix = { canonical: 'staff', absentOnAllRoutes: ['member', 'agent', 'admin'] };

test('collectRbacFailures records member role drift once', () => {
  const result = collectRbacFailures({
    account: 'member',
    portal: 'member',
    route: '/member',
    matrix: memberMatrix,
    current: { member: true, agent: true, staff: false, admin: false, notFound: false },
    runCtx,
    memberDriftSignatureAdded: false,
  });

  assert.equal(result.driftRecorded, true);
  assert.equal(result.failures.length, 2);
  assert.match(result.failures[0], /P0\.1_MISCONFIG_MEMBER_ROLE_DRIFT/);
  assert.match(result.failures[1], /P0\.1_RBAC_MARKER_MISMATCH/);
});

test('collectRbacFailures records canonical marker missing', () => {
  const result = collectRbacFailures({
    account: 'staff',
    portal: 'staff',
    route: '/staff',
    matrix: staffMatrix,
    current: { member: false, agent: false, staff: false, admin: false, notFound: true },
    runCtx,
    memberDriftSignatureAdded: false,
  });

  assert.equal(result.driftRecorded, false);
  assert.deepEqual(result.failures, [
    'P0.1_RBAC_CANONICAL_MARKER_MISSING account=staff route=/en/staff expected=staff visible={"member":false,"agent":false,"staff":false,"admin":false,"notFound":true}',
  ]);
});

test('shouldRetryP01FreshContext rejects mixed RBAC failures', () => {
  assert.equal(
    shouldRetryP01FreshContext({
      positiveCanonicalNotFound: true,
      failures: [
        'P0.1_RBAC_CANONICAL_MARKER_MISSING account=staff visible={"notFound":true}',
        'P0.1_RBAC_MARKER_MISMATCH account=staff visible={"admin":true}',
      ],
    }),
    false
  );
});
