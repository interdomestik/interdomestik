import { createRequire } from 'node:module';

import { startBrowserPortalServer } from './browser-auth-fixture.mjs';

const requireFromWeb = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { expect, test } = requireFromWeb('@playwright/test');
let origin;
let server;

test.beforeAll(async () => {
  ({ origin, server } = await startBrowserPortalServer());
});

test.afterAll(async () => new Promise(resolve => server.close(resolve)));

test('named reviewer login, scoped denial, and logout work on desktop', async ({ page }) => {
  const response = await page.goto(origin);
  expect(response.headers()['content-security-policy']).toContain("connect-src 'self'");
  await expect(page.getByRole('heading', { name: 'Hyni për të shqyrtuar' })).toBeVisible();

  await page.getByLabel('Emri i përdoruesit').fill('gazmend');
  await page.getByLabel('Fjalëkalimi').fill('wrong');
  await page.getByRole('button', { name: 'Hyni' }).click();
  await expect(page.getByRole('alert')).toHaveText(/nuk është i saktë/);

  await page.getByLabel('Fjalëkalimi').fill('correct');
  await page.getByRole('button', { name: 'Hyni' }).click();
  const accountMenu = page.locator('summary').filter({ hasText: 'Gazmend Abazi' });
  await expect(accountMenu).toBeVisible();
  await expect(page.getByText('Rishikimi i autoritetit — Pjesa A')).toBeVisible();

  await page.goto(`${origin}/#/review/private-other/M03A-PRIVATE`);
  await expect(page.getByText('Rishikimi i autoritetit — Pjesa A')).toBeVisible();
  await accountMenu.click();
  await page.getByRole('button', { name: 'Dilni nga llogaria' }).click();
  await expect(page.getByRole('heading', { name: 'Hyni për të shqyrtuar' })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`named reviewer workflow remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(origin);
    await page.getByLabel('Emri i përdoruesit').fill('gazmend');
    await page.getByLabel('Fjalëkalimi').fill('correct');
    await page.getByRole('button', { name: 'Hyni' }).click();
    await expect(page.getByText('Rishikimi i autoritetit — Pjesa A')).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'Gazmend Abazi' })).toBeVisible();
  });
}
