const actionQueries = [
  ['login', 'ui_action:login_submit ui_outcome:[unexpected,stalled]'],
  ['submit', 'ui_action:saved_draft_submit ui_outcome:[unexpected,stalled]'],
  ['slow', 'ui_action:[login_submit,saved_draft_submit] ui_outcome:slow'],
];

// Fixed captureMessage outcomes are error/default events, not trace_item_span records.
export const RESPONSIVENESS_ALERTS = actionQueries.map(([id, query]) => ({
  id: `ui-${id}`,
  name: `[UI] ${id} responsiveness`,
  docsRefs: ['docs/ops/sentry-responsiveness.md'],
  dataset: 'events',
  eventTypes: ['default', 'error'],
  queryType: 0,
  aggregate: 'count()',
  query,
  timeWindow: 5, // Catalog/UI minutes; modern monitor API uses seconds.
  thresholdType: 0,
  thresholds: { warning: 1, critical: 5 },
}));

export const RESPONSIVENESS_SETUP_DOCS = {
  migration:
    'https://www.sentry.help/en/articles/15015315-migrating-to-new-detectors-and-alerts-apis',
  monitors: 'https://docs.sentry.io/api/monitors/',
  createMonitor: 'https://docs.sentry.io/api/monitors/create-a-monitor-for-a-project/',
  createAlert: 'https://docs.sentry.io/api/monitors/create-an-alert-for-an-organization/',
};

/** Credential-free UI plan, not a writable API payload or proof of hosted configuration. */
export function responsivenessUiCatalog(config = {}) {
  const environment = config.environment ?? 'staging';
  if (environment !== 'staging') throw new Error('This rollout is staging-only.');
  if (config.project != null && !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(config.project))
    throw new Error('A valid exact Sentry project slug is required.');
  return {
    mode: 'catalog',
    setup: 'current-ui-only',
    remoteExecution: false,
    project: config.project ?? null,
    environment,
    status: 'requires_verified_staging_event_and_notification_routing',
    alerts: RESPONSIVENESS_ALERTS,
    monitorPlans: RESPONSIVENESS_ALERTS.map(alert => ({
      name: alert.name,
      project: config.project ?? null,
      environment,
      type: 'metric_issue',
      metric: 'Number of Errors',
      dataset: alert.dataset,
      eventTypes: alert.eventTypes,
      aggregate: alert.aggregate,
      queryType: alert.queryType,
      query: alert.query,
      windowMinutes: alert.timeWindow,
      apiTimeWindowSeconds: alert.timeWindow * 60,
      thresholds: alert.thresholds,
      routing: 'Verify the existing owner-approved warning/critical target in the current UI.',
    })),
    documentation: RESPONSIVENESS_SETUP_DOCS,
  };
}
