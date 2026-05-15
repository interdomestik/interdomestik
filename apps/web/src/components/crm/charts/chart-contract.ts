export const CRM_REPORTING_CHART_MARKER_PREFIX = 'crm-reporting-chart-';
export const CRM_REPORTING_CHART_MAX_CATEGORIES = 12;
export const CRM_REPORTING_CHART_MAX_SERIES = 6;
export const CRM_REPORTING_CHART_A11Y_SUMMARY_MAX_ITEMS = 5;
export const CRM_REPORTING_CHART_BUNDLE_DELTA_KB_MAX = 30;

export const CRM_REPORTING_CHART_PIPELINE_AMOUNT_MARKER = `${CRM_REPORTING_CHART_MARKER_PREFIX}pipeline-amount`;
export const CRM_REPORTING_CHART_FUNNEL_MOVEMENT_MARKER = `${CRM_REPORTING_CHART_MARKER_PREFIX}funnel-movement`;
export const CRM_REPORTING_CHART_STAGE_VELOCITY_MARKER = `${CRM_REPORTING_CHART_MARKER_PREFIX}stage-velocity`;

export const CRM_REPORTING_CHART_AXIS_LABEL_MAX_LENGTH = 20;

export const CRM_REPORTING_CHART_COLORS = {
  average: 'hsl(var(--secondary))',
  entered: 'hsl(var(--primary))',
  exited: 'hsl(var(--secondary))',
  grid: 'hsl(var(--border))',
  lost: 'hsl(var(--destructive))',
  median: 'hsl(var(--primary))',
  tick: 'hsl(var(--muted-foreground))',
  total: 'hsl(var(--secondary))',
  weighted: 'hsl(var(--primary))',
  won: 'hsl(var(--success))',
} as const;
