import { test } from '../fixtures/auth.fixture';
import { registerTenantClassificationSuite } from '../support/admin-tenant-classification';
import { isKsGateProject, isMkGateProject } from './gate-project-identity';

registerTenantClassificationSuite(test, {
  describeName: 'Strict Gate: admin tenant classification',
  isKsProject: testInfo => isKsGateProject(testInfo.project.name),
  isMkProject: testInfo => isMkGateProject(testInfo.project.name),
  memberPrefix: 'e2e-gate-tenant-review',
  namePrefix: 'E2E Gate Pending',
  emailPrefix: 'e2e.gate.tenant.review',
  annotateSkippedProjects: true,
});
