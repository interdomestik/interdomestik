import { db, eq, user } from '@interdomestik/database';
import { randomUUID } from 'node:crypto';

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

function isMkProject(testInfo: import('@playwright/test').TestInfo): boolean {
  return testInfo.project.name.includes('mk');
}

test.describe('Admin tenant classification', () => {
  test('admin can confirm pending tenant classification for a clean account', async ({
    adminPage: page,
  }, testInfo) => {
    const tenantId = isMkProject(testInfo) ? 'tenant_mk' : 'tenant_ks';
    const id = `e2e-pending-${randomUUID()}`;
    const now = new Date();
    const email = `${id}@example.com`;

    await db.insert(user).values({
      id,
      tenantId,
      name: `Pending Review ${id.slice(0, 8)}`,
      email,
      emailVerified: true,
      role: 'user',
      tenantClassificationPending: true,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await gotoApp(page, `${routes.adminUsers(testInfo)}/${id}`, testInfo);
      await expect(page.getByTestId('tenant-classification-controls')).toBeVisible();
      await page.getByTestId('tenant-classification-confirm').click();

      await expect(page.getByTestId('tenant-classification-confirmed')).toBeVisible();

      await expect
        .poll(async () => {
          const refreshed = await db.query.user.findFirst({
            where: eq(user.id, id),
            columns: { tenantClassificationPending: true },
          });
          return refreshed?.tenantClassificationPending ?? null;
        })
        .toBe(false);
    } finally {
      await db.delete(user).where(eq(user.id, id));
    }
  });
});
