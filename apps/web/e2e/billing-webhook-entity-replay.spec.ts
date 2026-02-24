import {
  and,
  billingInvoices,
  billingLedgerEntries,
  db,
  E2E_USERS,
  eq,
  webhookEvents,
} from '@interdomestik/database';
import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test';
import { createHmac, randomUUID } from 'node:crypto';

type BillingEntity = 'ks' | 'mk' | 'al';

const TENANT_BY_ENTITY: Record<BillingEntity, string> = {
  ks: 'tenant_ks',
  mk: 'tenant_mk',
  al: 'tenant_al',
};

const SHARED_SECRET_FALLBACK = 'whsec_e2e_shared';
const SECRET_BY_ENTITY: Record<BillingEntity, string> = {
  ks: process.env.PADDLE_WEBHOOK_SECRET_KEY_KS ?? `${SHARED_SECRET_FALLBACK}_ks`,
  mk: process.env.PADDLE_WEBHOOK_SECRET_KEY_MK ?? `${SHARED_SECRET_FALLBACK}_mk`,
  al: process.env.PADDLE_WEBHOOK_SECRET_KEY_AL ?? `${SHARED_SECRET_FALLBACK}_al`,
};

function projectSuffix(testInfo: TestInfo): string {
  return testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function scenarioId(testInfo: TestInfo, prefix: string): string {
  const nonce = randomUUID().replace(/-/g, '').slice(0, 10);
  return `${prefix}_${projectSuffix(testInfo)}_${nonce}`;
}

function webhookUrl(testInfo: TestInfo, entity: BillingEntity): string {
  const baseURL = testInfo.project.use.baseURL?.toString();
  if (!baseURL) {
    throw new Error('Playwright baseURL is required.');
  }
  return new URL(`/api/webhooks/paddle/${entity}`, new URL(baseURL).origin).toString();
}

function createPaddleSignature(body: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const payloadWithTime = `${ts}:${body}`;
  const h1 = createHmac('sha256', secret).update(payloadWithTime).digest('hex');
  return `ts=${ts};h1=${h1}`;
}

async function postEntityWebhook(args: {
  request: APIRequestContext;
  testInfo: TestInfo;
  entity: BillingEntity;
  payload: Record<string, unknown>;
}): Promise<Awaited<ReturnType<APIRequestContext['post']>>> {
  const bodyText = JSON.stringify(args.payload);
  const signature = createPaddleSignature(bodyText, SECRET_BY_ENTITY[args.entity]);

  return args.request.post(webhookUrl(args.testInfo, args.entity), {
    data: bodyText,
    headers: {
      'content-type': 'application/json',
      'paddle-signature': signature,
    },
  });
}

async function resolveUserIdByEmail(email: string): Promise<string> {
  const userRecord = await db.query.user.findFirst({
    where: (users, { eq }) => eq(users.email, email),
    columns: { id: true },
  });

  if (!userRecord?.id) {
    throw new Error(`Expected seeded user for email ${email}`);
  }

  return userRecord.id;
}

test.describe('A19 billing webhook entity replay wrong entity scenarios', () => {
  test('B1 billing webhook entity KS posts one invoice and one ledger entry', async ({
    request,
  }, testInfo) => {
    const eventId = scenarioId(testInfo, 'a19_b1_ks_evt');
    const providerTransactionId = scenarioId(testInfo, 'a19_b1_ks_tx');
    const ksUserId = await resolveUserIdByEmail(E2E_USERS.KS_MEMBER.email);

    const response = await postEntityWebhook({
      request,
      testInfo,
      entity: 'ks',
      payload: {
        event_id: eventId,
        event_type: 'transaction.completed',
        occurred_at: new Date().toISOString(),
        data: {
          id: providerTransactionId,
          status: 'completed',
          custom_data: {
            userId: ksUserId,
          },
          details: {
            totals: {
              total: '1000.00',
              currencyCode: 'EUR',
            },
          },
        },
      },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const tenantId = TENANT_BY_ENTITY.ks;
    const invoiceRows = await db
      .select({ id: billingInvoices.id })
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.tenantId, tenantId),
          eq(billingInvoices.billingEntity, 'ks'),
          eq(billingInvoices.providerTransactionId, providerTransactionId)
        )
      );
    const ledgerRows = await db
      .select({ id: billingLedgerEntries.id })
      .from(billingLedgerEntries)
      .where(
        and(
          eq(billingLedgerEntries.tenantId, tenantId),
          eq(billingLedgerEntries.billingEntity, 'ks'),
          eq(billingLedgerEntries.providerTransactionId, providerTransactionId)
        )
      );

    expect(invoiceRows).toHaveLength(1);
    expect(ledgerRows).toHaveLength(1);
  });

  test('B2 billing webhook entity MK posts one invoice and one ledger entry', async ({
    request,
  }, testInfo) => {
    const eventId = scenarioId(testInfo, 'a19_b2_mk_evt');
    const providerTransactionId = scenarioId(testInfo, 'a19_b2_mk_tx');
    const mkUserId = await resolveUserIdByEmail(E2E_USERS.MK_MEMBER.email);

    const response = await postEntityWebhook({
      request,
      testInfo,
      entity: 'mk',
      payload: {
        event_id: eventId,
        event_type: 'transaction.completed',
        occurred_at: new Date().toISOString(),
        data: {
          id: providerTransactionId,
          status: 'completed',
          custom_data: {
            userId: mkUserId,
          },
          details: {
            totals: {
              total: '1500.00',
              currencyCode: 'EUR',
            },
          },
        },
      },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const tenantId = TENANT_BY_ENTITY.mk;
    const invoiceRows = await db
      .select({ id: billingInvoices.id })
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.tenantId, tenantId),
          eq(billingInvoices.billingEntity, 'mk'),
          eq(billingInvoices.providerTransactionId, providerTransactionId)
        )
      );
    const ledgerRows = await db
      .select({ id: billingLedgerEntries.id })
      .from(billingLedgerEntries)
      .where(
        and(
          eq(billingLedgerEntries.tenantId, tenantId),
          eq(billingLedgerEntries.billingEntity, 'mk'),
          eq(billingLedgerEntries.providerTransactionId, providerTransactionId)
        )
      );

    expect(invoiceRows).toHaveLength(1);
    expect(ledgerRows).toHaveLength(1);
  });

  test('B3 billing webhook entity AL dark tenant stays fail-closed without invoice or ledger posting', async ({
    request,
  }, testInfo) => {
    const eventId = scenarioId(testInfo, 'a19_b3_al_evt');
    const providerTransactionId = scenarioId(testInfo, 'a19_b3_al_tx');

    const response = await postEntityWebhook({
      request,
      testInfo,
      entity: 'al',
      payload: {
        event_id: eventId,
        event_type: 'transaction.completed',
        occurred_at: new Date().toISOString(),
        data: {
          id: providerTransactionId,
          status: 'completed',
          custom_data: {
            tenantId: TENANT_BY_ENTITY.al,
          },
          details: {
            totals: {
              total: '500.00',
              currencyCode: 'EUR',
            },
          },
        },
      },
    });

    expect(response.status()).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal Server Error' });

    const invoiceRows = await db
      .select({ id: billingInvoices.id })
      .from(billingInvoices)
      .where(eq(billingInvoices.providerTransactionId, providerTransactionId));
    const ledgerRows = await db
      .select({ id: billingLedgerEntries.id })
      .from(billingLedgerEntries)
      .where(eq(billingLedgerEntries.providerTransactionId, providerTransactionId));
    const webhookRows = await db
      .select({
        id: webhookEvents.id,
        processingResult: webhookEvents.processingResult,
        processingScopeKey: webhookEvents.processingScopeKey,
      })
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, eventId));

    expect(invoiceRows).toHaveLength(0);
    expect(ledgerRows).toHaveLength(0);
    expect(webhookRows).toHaveLength(1);
    expect(webhookRows[0]?.processingResult).toBe('error');
    expect(webhookRows[0]?.processingScopeKey).toBe('entity:al');
  });

  test('B4 billing webhook wrong entity mismatch is rejected with no billing side effects', async ({
    request,
  }, testInfo) => {
    const eventId = scenarioId(testInfo, 'a19_b4_wrong_entity_evt');
    const providerTransactionId = scenarioId(testInfo, 'a19_b4_wrong_entity_tx');

    const response = await postEntityWebhook({
      request,
      testInfo,
      entity: 'ks',
      payload: {
        event_id: eventId,
        event_type: 'transaction.completed',
        occurred_at: new Date().toISOString(),
        data: {
          id: providerTransactionId,
          status: 'completed',
          custom_data: {
            tenantId: TENANT_BY_ENTITY.mk,
          },
          details: {
            totals: {
              total: '700.00',
              currencyCode: 'EUR',
            },
          },
        },
      },
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: 'Webhook entity mismatch' });

    const invoiceRows = await db
      .select({ id: billingInvoices.id })
      .from(billingInvoices)
      .where(eq(billingInvoices.providerTransactionId, providerTransactionId));
    const ledgerRows = await db
      .select({ id: billingLedgerEntries.id })
      .from(billingLedgerEntries)
      .where(eq(billingLedgerEntries.providerTransactionId, providerTransactionId));
    const webhookRows = await db
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.providerTransactionId, providerTransactionId),
          eq(webhookEvents.eventId, eventId)
        )
      );

    expect(invoiceRows).toHaveLength(0);
    expect(ledgerRows).toHaveLength(0);
    expect(webhookRows).toHaveLength(0);
  });

  test('B4 billing webhook replay does not double-post invoice or ledger', async ({
    request,
  }, testInfo) => {
    const firstEventId = scenarioId(testInfo, 'a19_b4_replay_evt_1');
    const replayEventId = scenarioId(testInfo, 'a19_b4_replay_evt_2');
    const providerTransactionId = scenarioId(testInfo, 'a19_b4_replay_tx');
    const ksUserId = await resolveUserIdByEmail(E2E_USERS.KS_MEMBER.email);

    const basePayload = {
      event_type: 'transaction.completed',
      occurred_at: new Date().toISOString(),
      data: {
        id: providerTransactionId,
        status: 'completed',
        custom_data: {
          userId: ksUserId,
        },
        details: {
          totals: {
            total: '1200.00',
            currencyCode: 'EUR',
          },
        },
      },
    };

    const first = await postEntityWebhook({
      request,
      testInfo,
      entity: 'ks',
      payload: {
        ...basePayload,
        event_id: firstEventId,
      },
    });

    const replay = await postEntityWebhook({
      request,
      testInfo,
      entity: 'ks',
      payload: {
        ...basePayload,
        event_id: replayEventId,
      },
    });

    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ success: true });

    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ success: true, duplicate: true });

    const tenantId = TENANT_BY_ENTITY.ks;
    const invoiceRows = await db
      .select({ id: billingInvoices.id })
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.tenantId, tenantId),
          eq(billingInvoices.billingEntity, 'ks'),
          eq(billingInvoices.providerTransactionId, providerTransactionId)
        )
      );
    const ledgerRows = await db
      .select({ id: billingLedgerEntries.id })
      .from(billingLedgerEntries)
      .where(
        and(
          eq(billingLedgerEntries.tenantId, tenantId),
          eq(billingLedgerEntries.billingEntity, 'ks'),
          eq(billingLedgerEntries.providerTransactionId, providerTransactionId)
        )
      );
    const webhookRows = await db
      .select({ id: webhookEvents.id, eventId: webhookEvents.eventId })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.processingScopeKey, 'entity:ks'),
          eq(webhookEvents.providerTransactionId, providerTransactionId)
        )
      );

    expect(invoiceRows).toHaveLength(1);
    expect(ledgerRows).toHaveLength(1);
    expect(webhookRows).toHaveLength(1);
    expect(webhookRows[0]?.eventId).toBe(firstEventId);
  });
});
