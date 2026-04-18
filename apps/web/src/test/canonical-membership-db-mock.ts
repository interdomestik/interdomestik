import { vi } from 'vitest';

type QueuedSelectResults = unknown[][];

export const CANONICAL_MEMBERSHIP_PLAN_COLUMNS = {
  id: 'membership_plans.id',
  tenantId: 'membership_plans.tenant_id',
  tier: 'membership_plans.tier',
  paddlePriceId: 'membership_plans.paddle_price_id',
  interval: 'membership_plans.interval',
  isActive: 'membership_plans.is_active',
} as const;

function createQueuedLimit(selectResults: QueuedSelectResults) {
  return vi.fn(async () => selectResults.shift() ?? []);
}

function createQueuedWhere(selectResults: QueuedSelectResults) {
  return vi.fn(() => ({
    orderBy: vi.fn(() => ({
      limit: createQueuedLimit(selectResults),
    })),
    limit: createQueuedLimit(selectResults),
  }));
}

function createQueuedFrom(selectResults: QueuedSelectResults) {
  return vi.fn(() => ({
    where: createQueuedWhere(selectResults),
  }));
}

export function createQueuedSelectMock(selectResults: QueuedSelectResults) {
  return vi.fn(() => ({
    from: createQueuedFrom(selectResults),
  }));
}

export function queueCanonicalTierResolution(
  selectResults: QueuedSelectResults,
  plan: { id: string; tier: string }
) {
  selectResults.push([], [], [plan]);
}
