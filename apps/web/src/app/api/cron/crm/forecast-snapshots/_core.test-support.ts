import { vi } from 'vitest';
import type { CrmForecastSnapshotWorkItem } from '@/adapters/crm/forecast-snapshot-work-items';
import {
  crmForecastSnapshotTestAuthority,
  crmForecastSnapshotTestWorkItem,
} from './_core.test-helpers';

const hoisted = vi.hoisted(() => ({ listScheduledTenantWork: vi.fn() }));

vi.mock('@interdomestik/database', () => ({
  listScheduledTenantWork: hoisted.listScheduledTenantWork,
}));

export const now = new Date('2026-05-14T05:15:00.000Z');
export const workItem: CrmForecastSnapshotWorkItem = crmForecastSnapshotTestWorkItem;
export {
  createCrmForecastSnapshotTestDeps as createDeps,
  createCrmForecastSnapshotWeightedRow as weightedRow,
  crmForecastSnapshotTestIngress as ingress,
} from './_core.test-helpers';

export function scheduleTenants(...tenantIds: string[]) {
  hoisted.listScheduledTenantWork.mockResolvedValue(
    tenantIds.map(tenantId => ({ authority: crmForecastSnapshotTestAuthority(tenantId), tenantId }))
  );
}

export { hoisted };
