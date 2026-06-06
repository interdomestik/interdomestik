import { D07_SENTRY_ALERTS } from './sentry-alerts-lib.mjs';

const D07_RULE_NAMES = new Set(D07_SENTRY_ALERTS.map(alert => alert.name));
const REQUIRED_LABELS = Object.freeze(['critical', 'warning']);

export function deriveEnterpriseRoutingFromD07Rules(remoteRules, options = {}) {
  const d07Rules = (remoteRules ?? []).filter(rule => D07_RULE_NAMES.has(rule?.name));
  if (d07Rules.length !== D07_RULE_NAMES.size) {
    throw new Error(
      `Expected ${D07_RULE_NAMES.size} D07 rules for routing reuse, found ${d07Rules.length}.`
    );
  }

  const owner = options.owner || deriveSharedOwner(d07Rules);
  const actionsByLabel = {};

  for (const label of REQUIRED_LABELS) {
    const actionSets = d07Rules.map(rule => getActionsForLabel(rule, label));
    const [firstActions] = actionSets;
    const firstKey = stableJson(firstActions);
    if (!actionSets.every(actions => stableJson(actions) === firstKey)) {
      throw new Error(`D07 ${label} routing actions are not consistent across remote rules.`);
    }
    actionsByLabel[label] = firstActions;
  }

  return {
    actionsByLabel,
    owner,
    reusedD07RuleIds: d07Rules.map(rule => String(rule.id)).sort(compareStrings),
  };
}

export function summarizeRoutingForOutput(routing) {
  return {
    ownerSet: Boolean(routing.owner),
    reusedD07RuleIds: routing.reusedD07RuleIds,
    actions: Object.fromEntries(
      REQUIRED_LABELS.map(label => [
        label,
        (routing.actionsByLabel[label] ?? []).map(action => ({
          type: action.type ?? null,
          targetType: action.targetType ?? null,
          hasTargetIdentifier: Boolean(action.targetIdentifier),
          hasInputChannelId: Boolean(action.inputChannelId),
          hasIntegrationId: Boolean(action.integrationId),
          hasSentryAppId: Boolean(action.sentryAppId),
        })),
      ])
    ),
  };
}

function deriveSharedOwner(d07Rules) {
  const owners = [...new Set(d07Rules.map(rule => rule.owner).filter(Boolean))];
  if (owners.length !== 1) {
    throw new Error(
      'D07 routing reuse requires one shared owner or SENTRY_ENTERPRISE_ALERT_OWNER.'
    );
  }
  return owners[0];
}

function getActionsForLabel(rule, label) {
  const trigger = (rule.triggers ?? []).find(candidate => candidate.label === label);
  const actions = trigger?.actions ?? [];
  if (actions.length === 0) {
    throw new Error(`D07 rule ${rule.name} is missing ${label} routing actions.`);
  }
  return actions.map(normalizeRoutingAction).sort(compareJson);
}

function normalizeRoutingAction(action) {
  return {
    type: action.type ?? null,
    targetType: action.targetType ?? null,
    targetIdentifier: action.targetIdentifier ?? null,
    inputChannelId: action.inputChannelId ?? null,
    integrationId: action.integrationId ?? null,
    sentryAppId: action.sentryAppId ?? null,
  };
}

function stableJson(value) {
  return JSON.stringify(value, (_key, current) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
    return Object.fromEntries(
      Object.entries(current).sort(([left], [right]) => left.localeCompare(right))
    );
  });
}

function compareStrings(left, right) {
  return left.localeCompare(right);
}

function compareJson(left, right) {
  return stableJson(left).localeCompare(stableJson(right));
}
