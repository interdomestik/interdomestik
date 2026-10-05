import { buildMetricAlertPayload } from './sentry-alerts-lib.mjs';

const actionQueries = [
  ['login', 'ui_action:login_submit ui_outcome:[unexpected,stalled]'],
  ['submit', 'ui_action:saved_draft_submit ui_outcome:[unexpected,stalled]'],
  ['slow', 'ui_action:[login_submit,saved_draft_submit] ui_outcome:slow'],
];
export const RESPONSIVENESS_ALERTS = actionQueries.map(([id, query]) => ({
  id: `ui-${id}`,
  name: `[UI] ${id} responsiveness`,
  docsRefs: ['docs/ops/sentry-responsiveness.md'],
  dataset: 'events_analytics_platform',
  queryType: 1,
  aggregate: 'count()',
  query,
  timeWindow: 5,
  thresholdType: 0,
  thresholds: { warning: 1, critical: 5 },
}));

export function responsivenessPayloads(config, routing) {
  if (config.environment !== 'staging') throw new Error('This rollout is staging-only.');
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(config.project ?? ''))
    throw new Error('A valid Sentry project slug is required.');
  if (
    !routing ||
    !routing.actionsByLabel?.warning?.length ||
    !routing.actionsByLabel?.critical?.length
  )
    throw new Error('Existing warning and critical alert routing is required.');
  return RESPONSIVENESS_ALERTS.map(alert =>
    buildMetricAlertPayload(alert, {
      project: config.project,
      environment: config.environment,
      owner: routing.owner,
      actionsByLabel: routing.actionsByLabel,
    })
  );
}

/** Routing and updates share one exact staging/project boundary. */
export function responsivenessProjectRules(rules, config) {
  if (config.environment !== 'staging') throw new Error('This rollout is staging-only.');
  return (rules ?? []).filter(
    rule =>
      rule.environment === config.environment &&
      rule.projects?.length === 1 &&
      rule.projects[0] === config.project
  );
}
