// The settled announcement names the committed query, so two results of equal size still change it.
export function buildResultsSummary(args: {
  count: number;
  filterOptions: ReadonlyArray<{ isActive: boolean; label: string; value: string }>;
  search?: string;
  tClaims: (key: string, values?: Record<string, string | number>) => string;
}) {
  const { count, filterOptions, search, tClaims } = args;
  const resultsCount = search
    ? tClaims('staff_queue.results_count_search', { count, search })
    : tClaims('staff_queue.results_count', { count });
  const activeFilterLabels = filterOptions
    .filter(option => option.isActive && option.value !== 'all')
    .map(option => option.label);
  const resultsFilters =
    activeFilterLabels.length > 0
      ? tClaims('staff_queue.results_filters', {
          filters: activeFilterLabels.join(tClaims('staff_queue.results_filter_separator')),
        })
      : null;
  return { resultsCount, resultsFilters };
}
