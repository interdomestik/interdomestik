import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  RESPONSIVENESS_ALERTS,
  responsivenessUiCatalog,
} from './sentry-responsiveness-alerts-lib.mjs';
import { runResponsivenessAlerts } from './sentry-responsiveness-alerts.mjs';

const scriptPath = fileURLToPath(new URL('./sentry-responsiveness-alerts.mjs', import.meta.url));

test('preserves the three approved fixed queries, thresholds and five-minute windows', () => {
  assert.deepEqual(
    RESPONSIVENESS_ALERTS.map(alert => alert.query),
    [
      'ui_action:login_submit ui_outcome:[unexpected,stalled]',
      'ui_action:saved_draft_submit ui_outcome:[unexpected,stalled]',
      'ui_action:[login_submit,saved_draft_submit] ui_outcome:slow',
    ]
  );
  const catalog = responsivenessUiCatalog({
    project: 'interdmestik-nextjs',
    environment: 'staging',
  });
  assert.equal(catalog.setup, 'current-ui-only');
  assert.equal(catalog.remoteExecution, false);
  assert.equal(catalog.monitorPlans.length, 3);
  for (const plan of catalog.monitorPlans) {
    assert.equal(plan.project, 'interdmestik-nextjs');
    assert.equal(plan.environment, 'staging');
    assert.equal(plan.type, 'metric_issue');
    assert.equal(plan.metric, 'Number of Errors');
    assert.equal(plan.dataset, 'events');
    assert.deepEqual(plan.eventTypes, ['default', 'error']);
    assert.equal(plan.queryType, 0);
    assert.equal(plan.aggregate, 'count()');
    assert.equal(plan.windowMinutes, 5);
    assert.equal(plan.apiTimeWindowSeconds, 300);
    assert.deepEqual(plan.thresholds, { warning: 1, critical: 5 });
  }
  assert.ok(!JSON.stringify(catalog).includes('rejected'));
});

test('catalog cannot fall back to production or widen exact project scope', () => {
  assert.throws(() => responsivenessUiCatalog({ environment: 'production' }), /staging-only/);
  assert.throws(() => responsivenessUiCatalog({ project: '../other' }), /exact Sentry project/);
  assert.throws(() => responsivenessUiCatalog({ project: '*' }), /exact Sentry project/);
  assert.equal(responsivenessUiCatalog().project, null);
  assert.match(responsivenessUiCatalog().status, /requires_verified/);
});

test('catalog stays credential-free and never invents notification identities', () => {
  const reads = [];
  const env = new Proxy(
    { SENTRY_ENVIRONMENT: 'staging', SENTRY_PROJECT: 'web' },
    {
      get(target, key) {
        reads.push(key);
        if (!['SENTRY_ENVIRONMENT', 'SENTRY_PROJECT'].includes(key))
          throw new Error('Credential access forbidden');
        return target[key];
      },
    }
  );
  let output = '';
  runResponsivenessAlerts('catalog', env, value => {
    output = value;
  });
  assert.deepEqual(reads, ['SENTRY_ENVIRONMENT', 'SENTRY_PROJECT']);
  const catalog = JSON.parse(output);
  assert.match(catalog.status, /requires_verified_staging_event_and_notification_routing/);
  assert.ok(!output.includes('targetIdentifier'));
  assert.ok(!output.includes('workflowIds'));
});

test('check/apply reject before any credential read or network request, even when credentials could be present', () => {
  let reads = 0;
  let requests = 0;
  const env = new Proxy(
    {},
    {
      get() {
        reads += 1;
        throw new Error('Credential source must not be read');
      },
    }
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    requests += 1;
    throw new Error('Network forbidden');
  };
  try {
    for (const mode of ['check', 'apply'])
      assert.throws(() => runResponsivenessAlerts(mode, env), /Remote check\/apply is disabled/);
    assert.equal(reads, 0);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CLI exits nonzero for retired remote modes without exposing a supplied token fixture', () => {
  for (const mode of ['check', 'apply']) {
    const child = spawnSync(process.execPath, [scriptPath, mode], {
      encoding: 'utf8',
      env: { SENTRY_AUTH_TOKEN: 'never-read-credential-fixture', SENTRY_ENVIRONMENT: 'staging' },
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /2026-08-17/);
    assert.match(child.stderr, /No credentials are read and no requests are made/);
    assert.equal(child.stdout, '');
    assert.ok(!child.stderr.includes('never-read-credential-fixture'));
  }
  const source = readFileSync(scriptPath, 'utf8');
  assert.ok(!source.includes('/alert-rules/'));
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('SENTRY_AUTH_TOKEN'));
});
