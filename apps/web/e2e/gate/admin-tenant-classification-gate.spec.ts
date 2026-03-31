import type { TestInfo } from '@playwright/test';

import { test } from '../fixtures/auth.fixture';
import { registerTenantClassificationSuite } from '../support/admin-tenant-classification';

function isKsGateProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'gate-ks-sq';
}

function isMkGateProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'gate-mk-mk';
}

registerTenantClassificationSuite(test, {
  describeName: 'Strict Gate: admin tenant classification',
  isKsProject: isKsGateProject,
  isMkProject: isMkGateProject,
  memberPrefix: 'e2e-gate-tenant-review',
  namePrefix: 'E2E Gate Pending',
  emailPrefix: 'e2e.gate.tenant.review',
  annotateSkippedProjects: true,
});
