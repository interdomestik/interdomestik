const RANK = { none: 0, low: 1, medium: 2, high: 3 };

export function aggregateRisk(decisions) {
  let severity = 'none';
  const categories = new Set();
  for (const decision of decisions) {
    const candidate = decision?.severity;
    if (candidate in RANK && RANK[candidate] > RANK[severity]) severity = candidate;
  }
  for (const decision of decisions) {
    if (decision?.severity === severity && decision.riskCategory) {
      categories.add(decision.riskCategory);
    }
  }
  return { severity, categories: [...categories].sort() };
}
