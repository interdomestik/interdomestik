import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { CrmForecastSnapshotWorkItem } from '@/adapters/crm/forecast-snapshot-work-items';
import {
  createCrmForecastSnapshotTestDeps,
  createCrmForecastSnapshotWeightedRow,
  crmForecastSnapshotTestWorkItem,
} from '../_core.test-helpers';

export const now = new Date('2026-05-15T10:30:00.000Z');
export const TEST_AUTHORITY = mintTestTenantAuthority('tenant-1');
export const workItem: CrmForecastSnapshotWorkItem = crmForecastSnapshotTestWorkItem;
export const weightedRow = createCrmForecastSnapshotWeightedRow;
export const createDeps = createCrmForecastSnapshotTestDeps;
