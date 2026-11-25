import { test } from './fixtures/auth.fixture';
import {
  preparePendingTenantClassificationMember,
  resetPendingTenantClassificationMember,
} from './fixtures/admin-tenant-classification.fixture';
import { confirmCurrentTenantClassification } from './support/admin-tenant-classification';

function isMkProject(testInfo: import('@playwright/test').TestInfo): boolean {
  return testInfo.project.name.includes('mk');
}

test.describe('Admin tenant classification', () => {
  test('admin can confirm pending tenant classification for a clean account', async ({
    adminPage: page,
  }, testInfo) => {
    const tenantId = isMkProject(testInfo) ? 'tenant_mk' : 'tenant_ks';
    const member = await preparePendingTenantClassificationMember({
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
        memberId: member.id,
        expectedTenantId: tenantId,
      });
    } finally {
      await resetPendingTenantClassificationMember(member);
    }
  });
});
