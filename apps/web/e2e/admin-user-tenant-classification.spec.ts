import { test } from './fixtures/auth.fixture';
import type { TestInfo } from '@playwright/test';

import { registerTenantClassificationSuite } from './support/admin-tenant-classification';

function isKsAdminProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'ks-sq' || testInfo.project.name === 'smoke';
}

function isMkAdminProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'mk-mk';
}

registerTenantClassificationSuite(test, {
  describeName: 'Admin user tenant classification controls',
  isKsProject: isKsAdminProject,
  isMkProject: isMkAdminProject,
  memberPrefix: 'e2e-tenant-review',
  namePrefix: 'E2E Pending',
  emailPrefix: 'e2e.tenant.review',
  dismissCookieBannerOnReassign: true,
});
