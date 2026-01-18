export const OPS_TEST_IDS = {
  DRAWER: 'ops-drawer',
  TABLE: {
    ROOT: 'ops-table',
    LOADING: 'ops-table-loading',
    EMPTY: 'ops-table-empty',
    ROW: 'ops-table-row',
    ACTIONS: 'ops-table-actions',
  },
  ACTION_BAR: 'ops-action-bar',
  DOCUMENTS: {
    PANEL: 'ops-documents-panel',
    EMPTY: 'ops-documents-empty',
    ROW: 'ops-document-row',
  },
  TIMELINE: {
    ROOT: 'ops-timeline',
    EMPTY: 'ops-timeline-empty',
    ITEM: 'ops-timeline-item',
  },
  FILTERS: {
    BAR: 'ops-filters-bar',
    TAB: (id: string) => `ops-tab-${id}`,
    SEARCH: 'ops-search-input',
  },
  EMPTY_STATE: 'ops-empty-state',
  LOADING_STATE: 'ops-loading-state',
} as const;
