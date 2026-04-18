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

export function createQueuedSelectMock(selectResults: QueuedSelectResults) {
  return vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => selectResults.shift() ?? []),
        })),
        limit: vi.fn(async () => selectResults.shift() ?? []),
      })),
    })),
  }));
}

export function queueCanonicalTierResolution(
  selectResults: QueuedSelectResults,
  plan: { id: string; tier: string }
) {
  selectResults.push([], [], [plan]);
}
