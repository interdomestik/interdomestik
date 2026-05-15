export {
  CRM_REPORTING_CHART_A11Y_SUMMARY_MAX_ITEMS,
  CRM_REPORTING_CHART_BUNDLE_DELTA_KB_MAX,
  CRM_REPORTING_CHART_FUNNEL_MOVEMENT_MARKER,
  CRM_REPORTING_CHART_MARKER_PREFIX,
  CRM_REPORTING_CHART_MAX_CATEGORIES,
  CRM_REPORTING_CHART_MAX_SERIES,
  CRM_REPORTING_CHART_PIPELINE_AMOUNT_MARKER,
  CRM_REPORTING_CHART_STAGE_VELOCITY_MARKER,
} from './chart-contract';
export {
  buildFunnelMovementScreenReaderSummary,
  buildPipelineAmountScreenReaderSummary,
  buildStageVelocityScreenReaderSummary,
  groupPipelineAmountRowsByCurrency,
  projectFunnelMovementRows,
  projectStageVelocityRows,
  truncateChartLabel,
  type FunnelMovementChartRow,
  type PipelineAmountChartRow,
  type StageVelocityChartRow,
} from './chart-projections';
export {
  FunnelMovementChartBoundary,
  PipelineAmountChartBoundary,
  StageVelocityChartBoundary,
} from './reporting-chart-boundary';
