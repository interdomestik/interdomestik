import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { routes } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

async function openOrganizer(page: Page, info: TestInfo) {
  await gotoApp(page, routes.home('en'), info, { marker: 'free-start-intake-shell' });
  const organizer = page.getByTestId('premium-free-start-organizer');
  await expect(organizer).toBeVisible();
  return organizer;
}

async function selectVehicle(organizer: Locator) {
  const vehicle = organizer.getByTestId('free-start-category-vehicle');
  await expect(async () => {
    await vehicle.click();
    await expect(vehicle).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
}

test.describe('pre-membership Free Start recovery', () => {
  test('restores all eligible facts and the safe step after a cold same-browser return', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async firstPage => {
      const organizer = await openOrganizer(firstPage, info);
      await selectVehicle(organizer);
      await organizer.getByRole('button', { name: 'Continue to guided intake' }).click();
      await organizer.getByLabel('What happened?').selectOption('collision');
      await organizer.getByLabel('When did it happen?').fill('2026-07-15');
      await organizer.getByLabel('Who are you dealing with?').fill('Northwind Insurance');
      await organizer.getByLabel('What do you want to recover?').selectOption('repair');
      await organizer
        .getByLabel('Brief summary')
        .fill('Rear bumper damage after a low-speed collision in a car park.');
      await expect(organizer.getByTestId('anonymous-draft-recovery-status')).toBeVisible();
      await organizer.getByRole('button', { name: 'Review your summary' }).click();
      await expect(
        organizer.getByRole('heading', { name: 'Review your Free Start pack shell.' })
      ).toBeVisible();

      const context = firstPage.context();
      await firstPage.close();
      const returnedPage = await context.newPage();
      const returnedOrganizer = await openOrganizer(returnedPage, info);

      await expect(returnedOrganizer.getByTestId('anonymous-draft-recovery-offer')).toBeVisible();
      await returnedOrganizer.getByRole('button', { name: 'Continue with these notes' }).click();

      await expect(
        returnedOrganizer.getByRole('heading', { name: 'Review your Free Start pack shell.' })
      ).toBeVisible();
      await expect(returnedOrganizer).toContainText('Vehicle damage');
      await expect(returnedOrganizer).toContainText('Collision damage');
      await expect(returnedOrganizer).toContainText('2026-07-15');
      await expect(returnedOrganizer).toContainText('Northwind Insurance');
      await expect(returnedOrganizer).toContainText('Repair or replacement costs');
      await expect(returnedOrganizer).toContainText(
        'Rear bumper damage after a low-speed collision in a car park.'
      );
    });
  });

  test('discards the device copy and returns to a clean organizer', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const organizer = await openOrganizer(page, info);
      await selectVehicle(organizer);
      await expect(organizer.getByTestId('anonymous-draft-recovery-status')).toBeVisible();

      await page.reload();
      const returnedOrganizer = page.getByTestId('premium-free-start-organizer');
      await expect(returnedOrganizer.getByTestId('anonymous-draft-recovery-offer')).toBeVisible();
      await returnedOrganizer.getByRole('button', { name: 'Discard from this device' }).click();

      await expect(returnedOrganizer.getByTestId('free-start-category-vehicle')).toBeVisible();
      await expect(returnedOrganizer.getByTestId('anonymous-draft-recovery-offer')).toHaveCount(0);
      expect(
        await page.evaluate(() => localStorage.getItem('interdomestik_free_start_recovery_v1'))
      ).toBeNull();
    });
  });
});
