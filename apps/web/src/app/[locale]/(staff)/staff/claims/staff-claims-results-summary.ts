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
  const [first, second, third] = filterOptions
    .filter(option => option.isActive && option.value !== 'all')
    .map(option => option.label);

  if (first === undefined) {
    return { resultsCount, resultsFilters: null };
  }
  if (second === undefined) {
    return { resultsCount, resultsFilters: tClaims('staff_queue.results_filters_one', { first }) };
  }
  if (third === undefined) {
    return {
      resultsCount,
      resultsFilters: tClaims('staff_queue.results_filters_two', { first, second }),
    };
  }
  return {
    resultsCount,
    resultsFilters: tClaims('staff_queue.results_filters_three', { first, second, third }),
  };
}
