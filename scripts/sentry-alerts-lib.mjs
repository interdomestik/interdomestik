const D07_DOC_REFS = Object.freeze([
  'docs/SLOS.md',
  'docs/RUNBOOK.md',
  'docs/plans/current-program.md',
  'docs/plans/current-tracker.md',
]);

export const D07_SENTRY_ALERTS = Object.freeze([
  Object.freeze({
    id: 'd07-slo1-webhook-burn-rate',
    name: '[D07] SLO1 Paddle webhook processing burn rate',
    slo: 'SLO1',
    docsRefs: D07_DOC_REFS,
    dataset: 'events_analytics_platform',
    queryType: 1,
    aggregate: 'failure_rate()',
    query: 'slo_alert:d07.webhook.processing',
    timeWindow: 60,
    thresholdType: 0,
    thresholds: Object.freeze({
      warning: 0.01,
      critical: 0.025,
    }),
  }),
  Object.freeze({
    id: 'd07-slo2-document-download-burn-rate',
    name: '[D07] SLO2 Document download burn rate',
    slo: 'SLO2',
    docsRefs: D07_DOC_REFS,
    dataset: 'events_analytics_platform',
    queryType: 1,
    aggregate: 'failure_rate()',
    query: 'slo_alert:d07.document.download',
    timeWindow: 60,
    thresholdType: 0,
    thresholds: Object.freeze({
      warning: 0.002,
      critical: 0.005,
    }),
  }),
  Object.freeze({
    id: 'd07-slo3-api-claims-latency',
    name: '[D07] SLO3 Core API latency p95 (/api/claims)',
    slo: 'SLO3',
    docsRefs: D07_DOC_REFS,
    dataset: 'events_analytics_platform',
    queryType: 1,
    aggregate: 'p95(transaction.duration)',
    query: 'slo_alert:d07.api.claims.latency',
    timeWindow: 60,
    thresholdType: 0,
    thresholds: Object.freeze({
      warning: 400,
      critical: 500,
    }),
  }),
]);

export function validateAlertCatalog(alerts) {
  const problems = [];
  const ids = new Set();
  const names = new Set();

  if (!Array.isArray(alerts)) {
    return ['alert catalog must be an array'];
  }

  if (alerts.length !== 3) {
    problems.push(`expected 3 D07 alerts, found ${alerts.length}`);
  }

  for (const alert of alerts) {
    if (!alert?.id) {
      problems.push('alert missing id');
      continue;
    }

    if (ids.has(alert.id)) {
      problems.push(`duplicate alert id: ${alert.id}`);
    }
    ids.add(alert.id);

    if (!alert.name) {
      problems.push(`alert ${alert.id} missing name`);
    } else if (names.has(alert.name)) {
      problems.push(`duplicate alert name: ${alert.name}`);
    } else {
      names.add(alert.name);
    }

    if (!Array.isArray(alert.docsRefs) || alert.docsRefs.length === 0) {
      problems.push(`alert ${alert.id} missing docsRefs`);
    }

    if (!['transactions', 'generic_metrics', 'events_analytics_platform'].includes(alert.dataset)) {
      problems.push(`alert ${alert.id} has unsupported dataset: ${alert.dataset}`);
    }

    if (typeof alert.queryType !== 'number') {
      problems.push(`alert ${alert.id} missing numeric queryType`);
    }

    if (typeof alert.aggregate !== 'string' || alert.aggregate.length === 0) {
      problems.push(`alert ${alert.id} missing aggregate`);
    }

    if (typeof alert.query !== 'string' || alert.query.length === 0) {
      problems.push(`alert ${alert.id} missing query`);
    }

    if (typeof alert.timeWindow !== 'number') {
      problems.push(`alert ${alert.id} missing timeWindow`);
    }

    if (typeof alert.thresholdType !== 'number') {
      problems.push(`alert ${alert.id} missing thresholdType`);
    }

    if (
      typeof alert.thresholds?.warning !== 'number' ||
      typeof alert.thresholds?.critical !== 'number'
    ) {
      problems.push(`alert ${alert.id} missing numeric warning/critical thresholds`);
    }
  }

  return problems;
}

export function parseAlertActionsJson(rawValue) {
  const trimmed = rawValue?.trim?.() ?? '';
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error('Alert actions JSON must decode to an array.');
  }

  for (const action of parsed) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new Error('Each alert action must be an object.');
    }
  }

  return parsed;
}

export function resolveActionsByLabel(env = process.env) {
  const shared = parseAlertActionsJson(env.SENTRY_ALERT_ACTIONS_JSON ?? '');
  const warning =
    env.SENTRY_ALERT_ACTIONS_WARNING_JSON == null
      ? shared
      : parseAlertActionsJson(env.SENTRY_ALERT_ACTIONS_WARNING_JSON);
  const critical =
    env.SENTRY_ALERT_ACTIONS_CRITICAL_JSON == null
      ? shared
      : parseAlertActionsJson(env.SENTRY_ALERT_ACTIONS_CRITICAL_JSON);

  return { warning, critical };
}

export function buildMetricAlertPayload(alert, context) {
  if (!alert) {
    throw new Error('Alert definition is required.');
  }

  const problems = validateSingleAlertDefinition(alert);
  if (problems.length > 0) {
    throw new Error(`Invalid alert definition: ${problems.join('; ')}`);
  }

  const actionsByLabel = context.actionsByLabel ?? { warning: [], critical: [] };

  return {
    name: alert.name,
    aggregate: alert.aggregate,
    dataset: alert.dataset,
    query: alert.query,
    queryType: alert.queryType,
    timeWindow: alert.timeWindow,
    thresholdType: alert.thresholdType,
    resolveThreshold: null,
    environment: context.environment ?? null,
    projects: [context.project],
    ...(context.owner ? { owner: context.owner } : {}),
    triggers: [
      {
        label: 'critical',
        thresholdType: alert.thresholdType,
        alertThreshold: alert.thresholds.critical,
        resolveThreshold: null,
        actions: actionsByLabel.critical ?? [],
      },
      {
        label: 'warning',
        thresholdType: alert.thresholdType,
        alertThreshold: alert.thresholds.warning,
        resolveThreshold: null,
        actions: actionsByLabel.warning ?? [],
      },
    ],
  };
}

function normalizeAction(action) {
  return {
    type: action.type ?? null,
    targetType: action.targetType ?? null,
    targetIdentifier: action.targetIdentifier ?? null,
    inputChannelId: action.inputChannelId ?? null,
    integrationId: action.integrationId ?? null,
    sentryAppId: action.sentryAppId ?? null,
  };
}

export function normalizeMetricAlertRule(rule, options = {}) {
  const compareActions = options.compareActions ?? true;
  const compareOwner = options.compareOwner ?? true;

  return {
    name: rule.name,
    aggregate: rule.aggregate,
    dataset: rule.dataset,
    query: rule.query,
    queryType: rule.queryType,
    timeWindow: rule.timeWindow,
    thresholdType: rule.thresholdType,
    resolveThreshold: rule.resolveThreshold ?? null,
    environment: rule.environment ?? null,
    projects: [...(rule.projects ?? [])].sort(),
    owner: compareOwner ? (rule.owner ?? null) : null,
    triggers: [...(rule.triggers ?? [])]
      .map(trigger => ({
        label: trigger.label,
        thresholdType: trigger.thresholdType,
        alertThreshold: trigger.alertThreshold,
        resolveThreshold: trigger.resolveThreshold ?? null,
        actions: compareActions
          ? [...(trigger.actions ?? [])].map(normalizeAction).sort(compareJson)
          : [],
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  };
}

export function diffMetricAlertRules({
  desired,
  remote,
  project,
  environment,
  actionsByLabel,
  owner,
  compareActions = true,
  compareOwner = true,
}) {
  const remoteByName = new Map((remote ?? []).map(rule => [rule.name, rule]));
  const diff = {
    missing: [],
    changed: [],
    unchanged: [],
  };

  for (const alert of desired) {
    const desiredRule = buildMetricAlertPayload(alert, {
      project,
      environment,
      actionsByLabel,
      owner,
    });
    const existingRule = remoteByName.get(desiredRule.name);

    if (!existingRule) {
      diff.missing.push(alert);
      continue;
    }

    if (
      JSON.stringify(normalizeMetricAlertRule(existingRule, { compareActions, compareOwner })) !==
      JSON.stringify(normalizeMetricAlertRule(desiredRule, { compareActions, compareOwner }))
    ) {
      diff.changed.push({ desired: alert, remote: existingRule });
      continue;
    }

    diff.unchanged.push(alert);
  }

  return diff;
}

function compareJson(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function validateSingleAlertDefinition(alert) {
  return validateAlertCatalog([alert]).filter(
    problem => !problem.startsWith('expected 3 D07 alerts')
  );
}

export function findMissingScopes(grantedScopes, requiredScopes) {
  const granted = new Set(grantedScopes ?? []);
  return (requiredScopes ?? []).filter(scope => !granted.has(scope));
}
