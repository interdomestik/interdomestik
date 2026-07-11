import { createRequire } from 'node:module';
import { startConsoleServer } from '../server/start.mjs';

const requireFromWeb = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { expect, test } = requireFromWeb('@playwright/test');
let origin, server;

test.beforeAll(async () => {
  server = await startConsoleServer({ port: 0 });
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('writes a validated receipt through the browser directory handle', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.privateInboxWrites = [];
    globalThis.privateInboxFail = false;
    globalThis.showDirectoryPicker = async options => ({
      async getFileHandle(name, fileOptions) {
        return {
          async createWritable() {
            return {
              async write(value) {
                if (globalThis.privateInboxFail) throw new Error('disk');
                globalThis.privateInboxWrites.push({ name, fileOptions, options, value });
              },
              async close() {},
            };
          },
        };
      },
    });
  });
  await page.goto(origin);
  const receiptId = await page.evaluate(async () => {
    const { buildReceipt } = await import('/src/state/receipt-builder.mjs');
    const itemIds = [
      'M03A-PRIVACY-OWNER',
      'M03A-MEDICAL-BOUNDARY',
      'M03A-CONSENT-FIELDS',
      'M03A-ACCESS-ROLES',
    ];
    const decisions = Object.fromEntries(
      itemIds.map(id => [id, { decision: 'approve', severity: 'high', riskCategory: 'privacy' }])
    );
    const receipt = await buildReceipt({
      schemaVersion: 1,
      packetId: 'mob-03a-part-a',
      packetVersion: '3',
      assignmentId: 'assign_mob03a_part_a',
      reviewerFixtureId: 'reviewer_governance_mk',
      reviewerDisplayName: 'Gazmend Abazi',
      reviewerRole: 'governance',
      packetRole: 'governance',
      authorityDisclaimer: 'Local fixture review only; not runtime authority.',
      decisions,
      structuredResponses: Object.fromEntries(itemIds.map(id => [id, {}])),
      submittedAt: '2026-07-11T20:00:00.000Z',
    });
    localStorage.setItem(`review-console:v1:receipt:${receipt.receiptId}`, JSON.stringify(receipt));
    return receipt.receiptId;
  });
  await page.goto(`${origin}/#/receipt/${receiptId}`);
  await page.getByRole('button', { name: 'Ruaj në inbox privat' }).click();
  await expect(page.locator('p[role="status"]')).toContainText('u ruajt në inbox-in privat');
  const writes = await page.evaluate(() => globalThis.privateInboxWrites);
  expect(writes).toHaveLength(1);
  expect(writes[0].name).toBe(`${receiptId}.json`);
  expect(writes[0].fileOptions).toEqual({ create: true });
  expect(writes[0].options).toEqual({
    id: 'interdomestik-reviewer-receipts',
    mode: 'readwrite',
  });
  expect(JSON.parse(writes[0].value).receiptId).toBe(receiptId);
  await page.evaluate(() => {
    globalThis.privateInboxFail = true;
  });
  await page.getByRole('button', { name: 'Ruaj në inbox privat' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('nuk mund të ruhej');
});
