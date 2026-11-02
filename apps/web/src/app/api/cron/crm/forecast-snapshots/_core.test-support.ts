import { vi } from 'vitest';
import type { CrmForecastSnapshotWorkItem } from '@/adapters/crm/forecast-snapshot-work-items';
import {
  createCrmForecastSnapshotTestDeps,
  createCrmForecastSnapshotWeightedRow,
  crmForecastSnapshotTestAuthority,
  crmForecastSnapshotTestIngress,
  crmForecastSnapshotTestWorkItem,
} from './_core.test-helpers';

const hoisted = vi.hoisted(() => ({ listScheduledTenantWork: vi.fn() }));

vi.mock('@interdomestik/database', () => ({
  listScheduledTenantWork: hoisted.listScheduledTenantWork,
}));

export const now = new Date('2026-05-14T05:15:00.000Z');
export const workItem: CrmForecastSnapshotWorkItem = crmForecastSnapshotTestWorkItem;
export const weightedRow = createCrmForecastSnapshotWeightedRow;
export const createDeps = createCrmForecastSnapshotTestDeps;
export const ingress = crmForecastSnapshotTestIngress;

export function scheduleTenants(...tenantIds: string[]) {
  hoisted.listScheduledTenantWork.mockResolvedValue(
    tenantIds.map(tenantId => ({ authority: crmForecastSnapshotTestAuthority(tenantId), tenantId }))
  );
}

export { hoisted };
