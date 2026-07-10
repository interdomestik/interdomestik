import { createRequire } from 'node:module';

import { startConsoleServer } from '../server/start.mjs';

const requireFromWeb = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { expect, test } = requireFromWeb('@playwright/test');

let origin;
let server;

test.beforeAll(async () => {
  server = await startConsoleServer({ port: 0 });
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('loads complete fixture bundles under connect-src none without fetch or XHR', async ({
  page,
}) => {
  await page.addInitScript(() => {
    globalThis.fixtureNetworkCalls = { fetch: 0, xhr: 0 };
    globalThis.fetch = () => {
      globalThis.fixtureNetworkCalls.fetch += 1;
      throw new Error('fetch must not be called');
    };
    globalThis.XMLHttpRequest = class {
      constructor() {
        globalThis.fixtureNetworkCalls.xhr += 1;
        throw new Error('XMLHttpRequest must not be constructed');
      }
    };
  });

  const response = await page.goto(origin);
  expect(response.headers()['content-security-policy']).toContain("connect-src 'none'");
  const result = await page.evaluate(async () => {
    const { createFixtureRepository } = await import('/src/data/fixture-repository.mjs');
    const repository = createFixtureRepository();
    const bundles = await Promise.all([
      repository.loadAssignmentBundle('assign_mob03a_part_a'),
      repository.loadAssignmentBundle('assign_mob03a_part_b'),
    ]);
    return {
      bundleIds: bundles.map(bundle => bundle.value.packet.id),
      itemCounts: bundles.map(bundle => bundle.value.packet.items.length),
      networkCalls: globalThis.fixtureNetworkCalls,
    };
  });

  expect(result).toEqual({
    bundleIds: ['mob-03a-part-a', 'mob-03a-part-b'],
    itemCounts: [4, 4],
    networkCalls: { fetch: 0, xhr: 0 },
  });
});

const noteText = 'Sugjerime të paraplotësuara — verifikoji dhe ndryshoji para dërgimit.';
const items = [
  'M03A-PRIVACY-OWNER',
  'M03A-MEDICAL-BOUNDARY',
  'M03A-CONSENT-FIELDS',
  'M03A-ACCESS-ROLES',
];

async function fillEmptyRequiredFields(page) {
  const fields = page.locator('.decision-form input[required], .decision-form textarea[required]');
  for (let index = 0; index < (await fields.count()); index += 1) {
    const field = fields.nth(index);
    const type = await field.getAttribute('type');
    if (['radio', 'checkbox'].includes(type) || (await field.inputValue())) continue;
    const id = await field.getAttribute('id');
    const value =
      type === 'date'
        ? '2026-07-10'
        : id?.toLowerCase().includes('ref')
          ? 'docs/final-review.md'
          : 'Vlerë finale e shqyrtuesit';
    await field.fill(value);
  }
}

async function openItem(page, itemId) {
  if (decodeURIComponent(new URL(page.url()).hash).endsWith(`/${itemId}`)) return;
  await page.locator(`[data-item-id="${itemId}"]`).click();
  await expect(page.locator('.save-state')).toHaveText('Drafti u rikthye');
}

async function proveSuggestionFlow(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(origin);
  await page.getByRole('button', { name: 'Vazhdo paketën' }).click();
  await expect(page.getByRole('note')).toHaveText(noteText);
  await expect(page.getByRole('note')).toHaveCount(1);
  expect(await page.locator('.decision-form input[type="radio"]:checked').count()).toBe(0);
  await expect(page.locator('#safe-evidence-confirmed')).not.toBeChecked();

  await page.locator('#concreteAnswer').fill('Përgjigjja finale e redaktuar');
  await page.locator('#reason').fill('');
  await openItem(page, items[1]);
  await page.locator('#response-medicalBoundary').selectOption('allowed');
  await openItem(page, items[0]);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('#concreteAnswer')).toHaveValue('Përgjigjja finale e redaktuar');
  await expect(page.locator('#reason')).toHaveValue('');
  expect(await page.locator('.decision-form input[type="radio"]:checked').count()).toBe(0);
  await expect(page.locator('#safe-evidence-confirmed')).not.toBeChecked();
  await page.locator('#reason').fill('Arsyeja finale e shqyrtuesit');

  for (const itemId of items) {
    await openItem(page, itemId);
    await page.locator('.decision-form input[type="radio"][value="approve"]').check();
    await fillEmptyRequiredFields(page);
  }
  await openItem(page, items[1]);
  await expect(page.locator('#response-medicalBoundary')).toHaveValue('allowed');
  await page.locator('#safe-evidence-confirmed').check();
  await page.getByRole('button', { name: 'Shqyrto dhe dërgo' }).click();
  await page.getByRole('button', { name: 'Dërgo shqyrtimin' }).click();
  await expect(page.getByRole('heading', { name: 'Vërtetimi i shqyrtimit' })).toBeVisible();
  const receipt = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(value =>
      value.startsWith('review-console:v1:receipt:')
    );
    return JSON.parse(localStorage.getItem(key));
  });
  expect(receipt.decisions[items[0]].concreteAnswer).toBe('Përgjigjja finale e redaktuar');
  expect(receipt.decisions[items[0]].reason).toBe('Arsyeja finale e shqyrtuesit');
  expect(receipt.structuredResponses[items[1]].medicalBoundary).toBe('allowed');
  for (const key of ['suggestionVersion', 'suggestedReview', 'useSessionDateFor']) {
    expect(receipt).not.toHaveProperty(key);
  }
}

test('desktop reviewer suggestions stay editable and canonical', async ({ page }) => {
  await proveSuggestionFlow(page, { width: 1280, height: 900 });
});

test('mobile reviewer suggestions stay editable and canonical', async ({ page }) => {
  await proveSuggestionFlow(page, { width: 390, height: 844 });
});
