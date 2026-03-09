import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMetricAlertPayload,
  diffMetricAlertRules,
  D07_SENTRY_ALERTS,
  findMissingScopes,
  normalizeMetricAlertRule,
  normalizeSentryBaseUrl,
  parseAlertActionsJson,
  validateAlertCatalog,
} from './sentry-alerts-lib.mjs';

test('D07 alert catalog defines the three committed SLO alert surfaces', () => {
  assert.deepEqual(
    D07_SENTRY_ALERTS.map(alert => alert.id),
    ['d07-slo1-webhook-burn-rate', 'd07-slo2-document-download-burn-rate', 'd07-slo3-api-claims-latency']
  );

  assert.equal(validateAlertCatalog(D07_SENTRY_ALERTS).length, 0);
  assert.equal(
    D07_SENTRY_ALERTS.find(alert => alert.id === 'd07-slo3-api-claims-latency')?.dataset,
    'events_analytics_platform'
  );
});

test('webhook burn-rate alert payload is built from the checked-in D07 definition', () => {
  const payload = buildMetricAlertPayload(
    D07_SENTRY_ALERTS.find(alert => alert.id === 'd07-slo1-webhook-burn-rate'),
    {
      project: 'web',
      environment: 'production',
      actionsByLabel: {
        critical: [{ type: 'email', targetType: 'specific', targetIdentifier: 'ops@interdomestik.dev' }],
        warning: [{ type: 'email', targetType: 'specific', targetIdentifier: 'ops@interdomestik.dev' }],
      },
    }
  );

  assert.equal(payload.name, '[D07] SLO1 Paddle webhook processing burn rate');
  assert.equal(payload.dataset, 'events_analytics_platform');
  assert.equal(payload.queryType, 1);
  assert.equal(payload.aggregate, 'failure_rate()');
  assert.equal(payload.query, 'slo_alert:d07.webhook.processing');
  assert.equal(payload.environment, 'production');
  assert.deepEqual(payload.projects, ['web']);
  assert.equal(payload.thresholdType, 0);
  assert.equal(payload.timeWindow, 60);
  assert.deepEqual(
    payload.triggers.map(trigger => ({
      label: trigger.label,
      alertThreshold: trigger.alertThreshold,
      actions: trigger.actions,
    })),
    [
      {
        label: 'critical',
        alertThreshold: 0.025,
        actions: [{ type: 'email', targetType: 'specific', targetIdentifier: 'ops@interdomestik.dev' }],
      },
      {
        label: 'warning',
        alertThreshold: 0.01,
        actions: [{ type: 'email', targetType: 'specific', targetIdentifier: 'ops@interdomestik.dev' }],
      },
    ]
  );
});

test('diffMetricAlertRules reports missing and drifted D07 rules by exact name', () => {
  const desired = D07_SENTRY_ALERTS;
  const remote = [
    {
      id: 'rule-1',
      name: '[D07] SLO1 Paddle webhook processing burn rate',
      dataset: 'events_analytics_platform',
      queryType: 1,
      query: 'slo_alert:d07.webhook.processing',
      aggregate: 'failure_rate()',
      thresholdType: 0,
      resolveThreshold: null,
      timeWindow: 30,
      environment: 'production',
      projects: ['web'],
      triggers: [{ label: 'critical', alertThreshold: 0.025, actions: [] }],
    },
  ];

  const diff = diffMetricAlertRules({
    desired,
    remote,
    project: 'web',
    environment: 'production',
    actionsByLabel: {
      critical: [],
      warning: [],
    },
  });

  assert.deepEqual(diff.missing.map(item => item.id), [
    'd07-slo2-document-download-burn-rate',
    'd07-slo3-api-claims-latency',
  ]);
  assert.deepEqual(diff.changed.map(item => item.desired.id), ['d07-slo1-webhook-burn-rate']);
});

test('parseAlertActionsJson accepts arrays of action objects and rejects other shapes', () => {
  assert.deepEqual(
    parseAlertActionsJson('[{"type":"email","targetType":"specific","targetIdentifier":"ops@interdomestik.dev"}]'),
    [{ type: 'email', targetType: 'specific', targetIdentifier: 'ops@interdomestik.dev' }]
  );

  assert.throws(() => parseAlertActionsJson('{"type":"email"}'), {
    name: 'TypeError',
    message: /must decode to an array/i,
  });
  assert.throws(() => parseAlertActionsJson('[null]'), {
    name: 'TypeError',
    message: /must be an object/i,
  });
});

test('diffMetricAlertRules can ignore owner and action drift for read-only checks', () => {
  const remote = [
    {
      id: 'rule-1',
      name: '[D07] SLO1 Paddle webhook processing burn rate',
      dataset: 'events_analytics_platform',
      queryType: 1,
      query: 'slo_alert:d07.webhook.processing',
      aggregate: 'failure_rate()',
      thresholdType: 0,
      resolveThreshold: null,
      timeWindow: 60,
      environment: 'production',
      projects: ['web'],
      owner: 'team:123',
      triggers: [
        {
          label: 'critical',
          thresholdType: 0,
          alertThreshold: 0.025,
          resolveThreshold: null,
          actions: [{ type: 'email', targetType: 'team', targetIdentifier: '123' }],
        },
        {
          label: 'warning',
          thresholdType: 0,
          alertThreshold: 0.01,
          resolveThreshold: null,
          actions: [{ type: 'email', targetType: 'team', targetIdentifier: '123' }],
        },
      ],
    },
  ];

  const diff = diffMetricAlertRules({
    desired: [D07_SENTRY_ALERTS[0]],
    remote,
    project: 'web',
    environment: 'production',
    actionsByLabel: {
      critical: [],
      warning: [],
    },
    compareActions: false,
    compareOwner: false,
  });

  assert.deepEqual(diff.missing, []);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.unchanged.map(item => item.id), ['d07-slo1-webhook-burn-rate']);
});

test('findMissingScopes reports missing Sentry auth scopes for live apply', () => {
  assert.deepEqual(
    findMissingScopes(['alerts:read', 'org:read'], ['alerts:read']),
    []
  );
  assert.deepEqual(
    findMissingScopes(['alerts:read', 'org:read'], ['alerts:read', 'alerts:write']),
    ['alerts:write']
  );
});

test('normalizeMetricAlertRule sorts projects, triggers, and actions deterministically', () => {
  const normalized = normalizeMetricAlertRule({
    name: '[D07] SLO1 Paddle webhook processing burn rate',
    dataset: 'events_analytics_platform',
    queryType: 1,
    query: 'slo_alert:d07.webhook.processing',
    aggregate: 'failure_rate()',
    thresholdType: 0,
    resolveThreshold: null,
    timeWindow: 60,
    environment: 'production',
    projects: ['web', 'api'],
    owner: 'team:123',
    triggers: [
      {
        label: 'warning',
        thresholdType: 0,
        alertThreshold: 0.01,
        resolveThreshold: null,
        actions: [{ type: 'email', targetType: 'team', targetIdentifier: 'b' }],
      },
      {
        label: 'critical',
        thresholdType: 0,
        alertThreshold: 0.025,
        resolveThreshold: null,
        actions: [{ type: 'email', targetType: 'team', targetIdentifier: 'a' }],
      },
    ],
  });

  assert.deepEqual(normalized.projects, ['api', 'web']);
  assert.deepEqual(normalized.triggers.map(trigger => trigger.label), ['critical', 'warning']);
  assert.deepEqual(normalized.triggers[0].actions, [
    {
      type: 'email',
      targetType: 'team',
      targetIdentifier: 'a',
      inputChannelId: null,
      integrationId: null,
      sentryAppId: null,
    },
  ]);
});

test('normalizeSentryBaseUrl trims trailing slashes without changing the origin', () => {
  assert.equal(normalizeSentryBaseUrl(), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl(null), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl(''), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl('https://sentry.io////'), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl('https://self-hosted.sentry.local/api/'), 'https://self-hosted.sentry.local/api');
  assert.equal(normalizeSentryBaseUrl('https://sentry.io'), 'https://sentry.io');
});
