import { createFixtureService } from '../server/fixture-service.mjs';
import { createPortalHandler } from '../server/portal-handler.mjs';
import { createReceiptService } from '../server/receipts/receipt-service.mjs';
import { startConsoleServer } from '../server/start.mjs';
import { createTestReceiptKeyring } from './receipt-key-fixtures.mjs';

export const browserAccount = Object.freeze({
  id: 'acct_gazmend',
  username: 'gazmend',
  displayName: 'Gazmend Abazi',
  role: 'governance',
  fixtureId: 'reviewer_governance_mk',
  disabled: false,
  sessionVersion: 1,
});

export async function startBrowserPortalServer() {
  const receiptService = createReceiptService({ keyring: await createTestReceiptKeyring() });
  const portalHandler = createPortalHandler({
    registry: { byId: new Map([[browserAccount.id, browserAccount]]) },
    sessionSecret: Buffer.alloc(32, 2).toString('base64url'),
    fixtureService: createFixtureService(),
    receiptService,
    verifyCredentials: async (_registry, username, password) =>
      username === browserAccount.username && password === 'correct'
        ? { ok: true, account: browserAccount }
        : { ok: false, code: 'invalid_credentials' },
  });
  const server = await startConsoleServer({ port: 0, portalHandler });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

export async function loginReviewer(page, origin) {
  await page.goto(origin);
  await page.getByLabel('Emri i përdoruesit').fill('gazmend');
  await page.getByLabel('Fjalëkalimi').fill('correct');
  await page.getByRole('button', { name: 'Hyni' }).click();
  await page.getByText('Rishikimi i autoritetit — Pjesa A').waitFor();
}
