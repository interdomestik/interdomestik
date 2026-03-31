import { test } from './fixtures/auth.fixture';
import {
  confirmCurrentTenantClassification,
  preparePendingTenantClassificationMember,
  resetPendingTenantClassificationMember,
} from './support/admin-tenant-classification';

function isMkProject(testInfo: import('@playwright/test').TestInfo): boolean {
  return testInfo.project.name.includes('mk');
}

test.describe('Admin tenant classification', () => {
  test('admin can confirm pending tenant classification for a clean account', async ({
    adminPage: page,
  }, testInfo) => {
    const tenantId = isMkProject(testInfo) ? 'tenant_mk' : 'tenant_ks';
    const memberId = await preparePendingTenantClassificationMember({
      memberPrefix: 'e2e-pending',
      namePrefix: 'Pending Review',
      emailPrefix: 'e2e.pending',
      role: 'user',
      tenantId,
      testInfo,
    });

    try {
      await confirmCurrentTenantClassification({
        page,
        testInfo,
        memberId,
        expectedTenantId: tenantId,
      });
    } finally {
      await resetPendingTenantClassificationMember(memberId);
    }
  });
});
