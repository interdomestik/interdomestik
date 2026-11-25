import {
  billingInvoices,
  billingLedgerEntries,
  dbAdmin,
  E2E_USERS,
  eq,
  inArray,
  or,
  webhookEvents,
} from '@interdomestik/database';
import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test';
import { createHmac, randomUUID } from 'node:crypto';

type BillingEntity = 'ks' | 'mk' | 'al';

const SHARED_SECRET_FALLBACK = 'whsec_e2e_shared';
const SECRET_BY_ENTITY: Record<BillingEntity, string> = {
  ks: process.env.PADDLE_WEBHOOK_SECRET_KEY_KS ?? `${SHARED_SECRET_FALLBACK}_ks`,
  mk: process.env.PADDLE_WEBHOOK_SECRET_KEY_MK ?? `${SHARED_SECRET_FALLBACK}_mk`,
  al: process.env.PADDLE_WEBHOOK_SECRET_KEY_AL ?? `${SHARED_SECRET_FALLBACK}_al`,
};

function scenarioId(testInfo: TestInfo, prefix: string): string {
  const project = testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const nonce = randomUUID().replace(/-/g, '').slice(0, 10);
  return `${prefix}_${project}_${nonce}`;
}

async function postClosedWebhook(args: {
  request: APIRequestContext;
  testInfo: TestInfo;
  entity: BillingEntity | null;
  eventId: string;
  transactionId: string;
  customData: { userId: string } | { tenantId: string };
}) {
  const baseURL = args.testInfo.project.use.baseURL?.toString();
  if (!baseURL) throw new Error('Playwright baseURL is required.');
  const path = args.entity ? `/api/webhooks/paddle/${args.entity}` : '/api/webhooks/paddle';
  const body = JSON.stringify({
    event_id: args.eventId,
    event_type: 'transaction.completed',
    occurred_at: new Date().toISOString(),
    data: {
      id: args.transactionId,
      status: 'completed',
      custom_data: args.customData,
      details: { totals: { total: '1000.00', currencyCode: 'EUR' } },
    },
  });
  const secret = args.entity
    ? SECRET_BY_ENTITY[args.entity]
    : (process.env.PADDLE_WEBHOOK_SECRET_KEY ?? SHARED_SECRET_FALLBACK);
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}:${body}`).digest('hex');
  const response = await args.request.post(new URL(path, baseURL).toString(), {
    data: body,
    failOnStatusCode: false,
    headers: {
      'content-type': 'application/json',
      'paddle-signature': `ts=${timestamp};h1=${digest}`,
    },
  });

  expect(response.status()).toBe(503);
  expect(response.headers()['retry-after']).toMatch(/^[1-9]\d*$/);
  expect(await response.json()).toMatchObject({ code: 'PADDLE_CLOSED' });
}

async function expectNoTransactionEffects(transactionId: string, eventIds: string[]) {
  const [invoices, ledger, receipts] = await Promise.all([
    dbAdmin
      .select({ id: billingInvoices.id })
      .from(billingInvoices)
      .where(eq(billingInvoices.providerTransactionId, transactionId)),
    dbAdmin
      .select({ id: billingLedgerEntries.id })
      .from(billingLedgerEntries)
      .where(eq(billingLedgerEntries.providerTransactionId, transactionId)),
    dbAdmin
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(
        or(
          eq(webhookEvents.providerTransactionId, transactionId),
          inArray(webhookEvents.eventId, eventIds)
        )
      ),
  ]);
  expect({ invoices, ledger, receipts }).toEqual({ invoices: [], ledger: [], receipts: [] });
}

async function resolveUserIdByEmail(email: string): Promise<string> {
  const userRecord = await dbAdmin.query.user.findFirst({
    where: (users, { eq }) => eq(users.email, email),
    columns: { id: true },
  });
  if (!userRecord?.id) throw new Error('Expected a seeded billing test member.');
  return userRecord.id;
}

test.describe('Paddle refuses signed webhook traffic before recording it', () => {
  for (const [route, entity, email] of [
    ['KS entity', 'ks', E2E_USERS.KS_MEMBER.email],
    ['MK entity', 'mk', E2E_USERS.MK_MEMBER.email],
    ['legacy', null, E2E_USERS.KS_MEMBER.email],
  ] as const) {
    test(`${route} route refuses a completed transaction`, async ({ request }, testInfo) => {
      const eventId = scenarioId(testInfo, 'evt_paddle_closed');
      const transactionId = scenarioId(testInfo, 'txn_paddle_closed');
      await postClosedWebhook({
        request,
        testInfo,
        entity,
        eventId,
        transactionId,
        customData: { userId: await resolveUserIdByEmail(email) },
      });
      await expectNoTransactionEffects(transactionId, [eventId]);
    });
  }

  for (const [route, entity, tenantId] of [
    ['AL dark tenant', 'al', 'tenant_al'],
    ['KS route with MK payload', 'ks', 'tenant_mk'],
  ] as const) {
    test(`${route} remains closed before entity resolution`, async ({ request }, testInfo) => {
      const eventId = scenarioId(testInfo, 'evt_paddle_closed');
      const transactionId = scenarioId(testInfo, 'txn_paddle_closed');
      await postClosedWebhook({
        request,
        testInfo,
        entity,
        eventId,
        transactionId,
        customData: { tenantId },
      });
      await expectNoTransactionEffects(transactionId, [eventId]);
    });
  }

  test('same-event retries and a second event for the same transaction stay unstored', async ({
    request,
  }, testInfo) => {
    const firstEventId = scenarioId(testInfo, 'evt_paddle_first');
    const secondEventId = scenarioId(testInfo, 'evt_paddle_second');
    const transactionId = scenarioId(testInfo, 'txn_paddle_closed');
    const delivery = {
      request,
      testInfo,
      entity: 'ks' as const,
      transactionId,
      customData: { userId: await resolveUserIdByEmail(E2E_USERS.KS_MEMBER.email) },
    };
    await postClosedWebhook({ ...delivery, eventId: firstEventId });
    await postClosedWebhook({ ...delivery, eventId: firstEventId });
    await postClosedWebhook({ ...delivery, eventId: secondEventId });
    await expectNoTransactionEffects(transactionId, [firstEventId, secondEventId]);
  });
});
