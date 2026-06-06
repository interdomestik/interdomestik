import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ENTERPRISE_ALERT_CONTRACT,
  ENTERPRISE_SENTRY_ALERTS,
  buildEnterpriseMetricAlertPayload,
  diffEnterpriseMetricAlertRules,
  validateEnterpriseAlertCatalog,
} from './sentry-enterprise-alerts-lib.mjs';

test('enterprise alert catalog defines the three contracted coverage categories', () => {
  assert.deepEqual(
    ENTERPRISE_SENTRY_ALERTS.map(alert => alert.id),
    [
      'ent-alert-auth-session-coverage',
      'ent-alert-protected-route-coverage',
      'ent-alert-tenant-boundary-coverage',
    ]
  );
  assert.deepEqual(
    ENTERPRISE_SENTRY_ALERTS.map(alert => alert.category),
    ['auth_session', 'protected_route', 'tenant_boundary']
  );
  assert.equal(validateEnterpriseAlertCatalog(ENTERPRISE_SENTRY_ALERTS).length, 0);
});

test('enterprise alert payloads use low-cardinality Sentry metric alert fields', () => {
  const payload = buildEnterpriseMetricAlertPayload(ENTERPRISE_SENTRY_ALERTS[1], {
    project: 'interdmestik-nextjs',
    environment: 'production',
    actionsByLabel: { critical: [], warning: [] },
  });

  assert.equal(payload.name, '[ENT] Protected route failure coverage');
  assert.equal(payload.dataset, 'events_analytics_platform');
  assert.equal(payload.aggregate, 'count()');
  assert.equal(payload.queryType, 1);
  assert.equal(payload.thresholdType, 0);
  assert.equal(payload.timeWindow, 60);
  assert.equal(payload.resolveThreshold, 1);
  assert.equal(
    payload.query,
    `enterprise_alert:protected_route route_contract:canonical_protected_route ` +
      `alert_contract:${ENTERPRISE_ALERT_CONTRACT}`
  );
  assert.deepEqual(
    payload.triggers.map(trigger => ({
      label: trigger.label,
      alertThreshold: trigger.alertThreshold,
      resolveThreshold: trigger.resolveThreshold,
    })),
    [
      { label: 'critical', alertThreshold: 5, resolveThreshold: 1 },
      { label: 'warning', alertThreshold: 1, resolveThreshold: 1 },
    ]
  );
});

test('enterprise alert catalog keeps private identifiers out of provider queries', () => {
  const forbidden = [
    'tenantId',
    'userId',
    'branchId',
    'claimId',
    'documentId',
    'email:',
    'cookie',
    'token',
    'http.url',
    '/member/',
    '/agent/',
    '/staff/',
    '/admin/',
  ];
  const serialized = JSON.stringify(ENTERPRISE_SENTRY_ALERTS);

  for (const term of forbidden) {
    assert.equal(serialized.includes(term), false, `unexpected private query term: ${term}`);
  }
});

test('enterprise alert catalog rejects unsupported category and threshold drift', () => {
  const invalid = {
    ...ENTERPRISE_SENTRY_ALERTS[0],
    category: 'raw_tenant_path',
    thresholds: { warning: 2, critical: 5 },
  };

  assert.deepEqual(validateEnterpriseAlertCatalog([invalid], { allowSubset: true }), [
    'enterprise alert ent-alert-auth-session-coverage has unsupported category: raw_tenant_path',
    'ent-alert-auth-session-coverage threshold drift',
    'enterprise alert ent-alert-auth-session-coverage query missing category',
  ]);
});

test('enterprise drift check compares checked-in rules by exact provider name', () => {
  const remote = [
    {
      id: 'rule-1',
      name: '[ENT] Auth/session failure coverage',
      dataset: 'events_analytics_platform',
      queryType: 1,
      query: `enterprise_alert:auth_session alert_contract:${ENTERPRISE_ALERT_CONTRACT}`,
      aggregate: 'count()',
      thresholdType: 0,
      resolveThreshold: 1,
      timeWindow: 30,
      environment: 'production',
      projects: ['interdmestik-nextjs'],
      triggers: [{ label: 'critical', alertThreshold: 5, resolveThreshold: 1, actions: [] }],
    },
  ];

  const diff = diffEnterpriseMetricAlertRules({
    remote,
    project: 'interdmestik-nextjs',
    environment: 'production',
    actionsByLabel: { critical: [], warning: [] },
  });

  assert.deepEqual(
    diff.missing.map(alert => alert.id),
    ['ent-alert-protected-route-coverage', 'ent-alert-tenant-boundary-coverage']
  );
  assert.deepEqual(
    diff.changed.map(item => item.desired.id),
    ['ent-alert-auth-session-coverage']
  );
});

test('enterprise check rejects Sentry org values that look like URLs', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./sentry-enterprise-alerts.mjs', import.meta.url)), 'check', '--json'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        SENTRY_AUTH_TOKEN: 'token',
        SENTRY_ORG: 'https://example.invalid',
        SENTRY_PROJECT: 'interdmestik-nextjs',
      },
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SENTRY_ORG must be a Sentry slug/);
});
