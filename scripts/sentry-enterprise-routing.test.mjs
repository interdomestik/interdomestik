import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveEnterpriseRoutingFromD07Rules,
  summarizeRoutingForOutput,
} from './sentry-enterprise-routing-lib.mjs';
import { applyEnterpriseAlerts } from './sentry-enterprise-provider-lib.mjs';

const D07_NAMES = [
  '[D07] SLO1 Paddle webhook processing burn rate',
  '[D07] SLO2 Document download burn rate',
  '[D07] SLO3 Core API latency p95 (/api/claims)',
];

test('derives enterprise routing from consistent remote D07 rules', () => {
  const routing = deriveEnterpriseRoutingFromD07Rules(
    D07_NAMES.map((name, index) => d07Rule(name, index))
  );

  assert.equal(routing.owner, 'team:platform');
  assert.deepEqual(routing.reusedD07RuleIds, ['18664', '18665', '18666']);
  assert.equal(routing.actionsByLabel.critical.length, 1);
  assert.equal(routing.actionsByLabel.warning.length, 1);

  const summary = summarizeRoutingForOutput(routing);
  assert.equal(summary.ownerSet, true);
  assert.equal(summary.actions.critical[0].hasTargetIdentifier, true);
  assert.equal(JSON.stringify(summary).includes('platform-team-id'), false);
});

test('rejects D07 routing reuse when actions are inconsistent', () => {
  const rules = D07_NAMES.map((name, index) => d07Rule(name, index));
  rules[2].triggers[0].actions[0].targetIdentifier = 'different-team-id';

  assert.throws(
    () => deriveEnterpriseRoutingFromD07Rules(rules),
    /D07 critical routing actions are not consistent/
  );
});

test('derives D07 routing regardless of equivalent action order', () => {
  const rules = D07_NAMES.map((name, index) => d07Rule(name, index));
  for (const rule of rules) {
    rule.triggers[0].actions.push({
      type: 'slack',
      inputChannelId: 'sentry-alert-channel',
    });
    rule.triggers[0].actions.reverse();
  }

  const routing = deriveEnterpriseRoutingFromD07Rules(rules);

  assert.deepEqual(
    routing.actionsByLabel.critical.map(action => action.type).sort(compareStrings),
    ['email', 'slack'].sort(compareStrings)
  );
});

test('enterprise apply requires routing reuse before remote config validation', async () => {
  await assert.rejects(
    () => applyEnterpriseAlerts({}, { reuseD07Routing: false }),
    /requires --reuse-d07-routing/
  );
});

test('rejects D07 routing reuse without one shared owner unless overridden', () => {
  const rules = D07_NAMES.map((name, index) => d07Rule(name, index));
  rules[1].owner = 'team:security';

  assert.throws(() => deriveEnterpriseRoutingFromD07Rules(rules), /requires one shared owner/);

  assert.equal(
    deriveEnterpriseRoutingFromD07Rules(rules, { owner: 'team:enterprise' }).owner,
    'team:enterprise'
  );
});

function d07Rule(name, index) {
  return {
    id: String(18664 + index),
    name,
    owner: 'team:platform',
    triggers: [
      {
        label: 'critical',
        actions: [
          {
            id: `critical-action-${index}`,
            type: 'email',
            targetType: 'team',
            targetIdentifier: 'platform-team-id',
          },
        ],
      },
      {
        label: 'warning',
        actions: [
          {
            id: `warning-action-${index}`,
            type: 'email',
            targetType: 'team',
            targetIdentifier: 'platform-team-id',
          },
        ],
      },
    ],
  };
}

function compareStrings(left, right) {
  return left.localeCompare(right);
}
