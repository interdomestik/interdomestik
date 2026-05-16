export const CRM_VISUAL_BASELINE_TAG = '@crm-visual-baseline';

export const CRM_VISUAL_BASELINE_MARKERS = [
  'agent-crm-page-ready',
  'admin-crm-page-ready',
  'staff-crm-page-ready',
] as const;

export type CrmVisualBaselineMarker = (typeof CRM_VISUAL_BASELINE_MARKERS)[number];
