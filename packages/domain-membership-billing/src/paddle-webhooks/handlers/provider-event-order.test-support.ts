type StoredProviderOrder = {
  status: string;
  providerSubscriptionId: string;
  providerEventOccurredAt: string | null;
  providerEventId: string | null;
};

/** Mirrors the subscription row-lock projection used by the Drizzle test doubles. */
export function projectLockedSubscriptionOrder(
  row: StoredProviderOrder,
  comparisonExpression: unknown
): {
  status: string;
  providerSubscriptionId: string;
  providerEventId: string | null;
  comparison: 'newer' | 'equal' | 'older' | null;
} {
  const incoming = Date.parse(findTimestamp(comparisonExpression)!);
  const marker = row.providerEventOccurredAt ? Date.parse(row.providerEventOccurredAt) : null;
  let comparison: 'newer' | 'equal' | 'older' | null = null;
  if (marker !== null) {
    if (incoming > marker) comparison = 'newer';
    else if (incoming === marker) comparison = 'equal';
    else comparison = 'older';
  }
  return {
    status: row.status,
    providerSubscriptionId: row.providerSubscriptionId,
    providerEventId: row.providerEventId,
    comparison,
  };
}

function findTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}T/.test(value) ? value : undefined;
  if (!value || typeof value !== 'object') return undefined;
  for (const nested of Object.values(value)) {
    const found = findTimestamp(nested);
    if (found) return found;
  }
  return undefined;
}
