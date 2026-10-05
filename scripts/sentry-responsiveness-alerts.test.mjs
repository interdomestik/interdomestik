import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RESPONSIVENESS_ALERTS,
  responsivenessPayloads,
  responsivenessProjectRules,
} from './sentry-responsiveness-alerts-lib.mjs';
const config = { project: 'interdomestik', environment: 'staging' };
const routing = {
  owner: 'team:1',
  actionsByLabel: { warning: [{ type: 'email' }], critical: [{ type: 'email' }] },
};
test('staging rules bind project, diagnostic signals and existing routing', () => {
  const payloads = responsivenessPayloads(config, routing);
  assert.equal(payloads.length, 3);
  for (const payload of payloads) {
    assert.equal(payload.environment, 'staging');
    assert.deepEqual(payload.projects, ['interdomestik']);
    assert.equal(payload.owner, routing.owner);
    assert.equal(payload.aggregate, 'count()');
    assert.deepEqual(payload.triggers[0].actions, routing.actionsByLabel.critical);
    assert.deepEqual(payload.triggers[1].actions, routing.actionsByLabel.warning);
  }
  assert.ok(RESPONSIVENESS_ALERTS[0].query.includes('login_submit'));
  assert.ok(RESPONSIVENESS_ALERTS[1].query.includes('saved_draft_submit'));
  assert.ok(!JSON.stringify(payloads).includes('rejected'));
});
test('never creates production rules or invents notification targets', () => {
  assert.throws(
    () => responsivenessPayloads({ ...config, environment: 'production' }, routing),
    /staging-only/
  );
  assert.throws(
    () => responsivenessPayloads(config, { actionsByLabel: { warning: [], critical: [] } }),
    /routing/
  );
  assert.throws(() => responsivenessPayloads({ ...config, project: '../other' }, routing), /slug/);
});

test('routing excludes other environments, projects and organization-wide rules', () => {
  const rule = { name: 'existing notification routing', environment: 'staging', projects: ['web'] };
  const rules = [
    rule,
    { ...rule, environment: 'production' },
    { ...rule, projects: ['other'] },
    { ...rule, projects: ['web', 'other'] },
    { ...rule, projects: undefined },
  ];
  assert.deepEqual(responsivenessProjectRules(rules, { environment: 'staging', project: 'web' }), [
    rule,
  ]);
  assert.throws(() =>
    responsivenessProjectRules(rules, { environment: 'production', project: 'web' })
  );
});
