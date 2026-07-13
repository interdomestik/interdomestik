import { createRequire } from 'node:module';
import { startBrowserPortalServer } from './browser-auth-fixture.mjs';
import {
  installDirectoryScenario,
  submissionArtifacts,
  submitCompleteReview,
} from './receipt-submission-browser-fixture.mjs';

const requireFromWeb = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { expect, test } = requireFromWeb('@playwright/test');
let origin, server;

test.beforeAll(async () => {
  ({ origin, server } = await startBrowserPortalServer());
});

test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('submit synchronously picks a directory, stores canonical receipt, writes once, and opens inbox', async ({
  page,
}) => {
  await installDirectoryScenario(page);
  await submitCompleteReview(page, origin);
  await expect(page).toHaveURL(/\/#\/$/);
  const { probe, receipt } = await submissionArtifacts(page);
  expect(probe.pickerCalls).toBe(1);
  expect(probe.clickTrusted).toBe(true);
  expect(probe.pickerDuringClick).toBe(true);
  expect(probe.userActivationActive).toBe(true);
  expect(probe.writes).toHaveLength(1);
  expect(probe.writes[0].name).toBe(`${receipt.receiptId}.json`);
  expect(probe.writes[0].fileOptions).toEqual({ create: true });
  expect(JSON.parse(probe.writes[0].text)).toEqual(receipt);
  expect(new URL(page.url()).hash).toBe('#/');
  const partA = page.locator('.assignment-card').filter({
    has: page.getByText('mob-03a-part-a', { exact: true }),
  });
  const partB = page.locator('.assignment-card').filter({
    has: page.getByText('mob-03a-part-b', { exact: true }),
  });
  await expect(partA.locator('[data-status="submitted"]')).toHaveText('Dorëzuar');
  await expect(partA.getByText(`Versioni i paketës: ${receipt.packetVersion}`)).toBeVisible();
  await expect(partA.locator('time')).toHaveAttribute('datetime', receipt.submittedAt);
  await expect(partA.locator('code', { hasText: receipt.receiptId })).toBeVisible();
  await expect(partB.locator('[data-status="next-action"]')).toHaveText('Hapi i radhës');
  await partA
    .getByRole('button', {
      name: 'Shiko vërtetimin — mob-03a-part-a — assign_mob03a_part_a',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(`${origin}/#/receipt/${receipt.receiptId}`);
});

for (const scenario of ['unsupported', 'cancelled', 'denied', 'write_failed']) {
  test(`${scenario} stores the receipt and opens export recovery`, async ({ page }) => {
    await installDirectoryScenario(page, scenario);
    await submitCompleteReview(page, origin);
    await expect(page.getByRole('heading', { name: 'Vërtetimi i shqyrtimit' })).toBeVisible();
    const { probe, receipt } = await submissionArtifacts(page);
    expect(receipt.receiptId).toMatch(/^rec_[a-f0-9]{24}$/);
    expect(probe.clickTrusted).toBe(true);
    expect(probe.pickerCalls).toBe(scenario === 'unsupported' ? 0 : 1);
    expect(probe.pickerDuringClick).toBe(scenario === 'unsupported' ? null : true);
    expect(probe.userActivationActive).toBe(scenario === 'unsupported' ? null : true);
    await expect(page.getByRole('button', { name: 'Eksporto JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ruaj në inbox privat' })).toHaveCount(
      scenario === 'unsupported' ? 0 : 1
    );
  });
}
