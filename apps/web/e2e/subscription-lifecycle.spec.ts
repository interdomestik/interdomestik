import { db } from '@interdomestik/database';
import type { Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

type PaddleWebhookPayload = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: Record<string, unknown>;
};

function buildPaddleSignature(body: string, secret: string) {
  // Paddle verifies signatures against a tight timestamp window.
  // Use a current (or slightly past) Unix timestamp to avoid being rejected.
  const ts = Math.floor(Date.now() / 1000) - 1;
  const payload = `${ts}:${body}`;
  const h1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `ts=${ts};h1=${h1}`;
}

async function postPaddleWebhook(page: Page, payload: PaddleWebhookPayload) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET_KEY;
  if (!secret) {
    throw new Error('PADDLE_WEBHOOK_SECRET_KEY is required for webhook tests');
  }

  // Paddle verifies the signature against the raw request body.
  // Playwright will JSON.stringify `data` when it's an object; sign that exact string.
  const body = JSON.stringify(payload);
  const signature = buildPaddleSignature(body, secret);

  return page.request.post('/api/webhooks/paddle', {
    data: payload,
    headers: {
      'paddle-signature': signature,
    },
  });
}

function buildSubscriptionPayload(args: {
  eventType: string;
  eventId: string;
  subscriptionId: string;
  userId: string;
  status: string;
  priceId: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  return {
    event_id: args.eventId,
    event_type: args.eventType,
    occurred_at: new Date().toISOString(),
    data: {
      id: args.subscriptionId,
      status: args.status,
      custom_data: { userId: args.userId },
      items: [
        {
          price: {
            id: args.priceId,
            unitPrice: { amount: '2000', currencyCode: 'EUR' },
          },
        },
      ],
      customer_id: `cus_${args.userId.slice(0, 8)}`,
      current_billing_period: {
        starts_at: args.periodStart.toISOString(),
        ends_at: args.periodEnd.toISOString(),
      },
    },
  } satisfies PaddleWebhookPayload;
}

test.describe('Subscription Lifecycle', () => {
  let webhookEventsAvailable = false;

  test.beforeAll(async () => {
    try {
      const result = await db.execute(
        sql`select to_regclass('public.webhook_events') as table_name`
      );
      const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
      const firstRow = rows[0] as { table_name?: string | null } | undefined;
      webhookEventsAvailable = Boolean(firstRow?.table_name);
    } catch {
      webhookEventsAvailable = false;
    }
  });

  test('signup -> checkout -> success -> cancel via webhook', async ({ page }) => {
    test.skip(
      !process.env.PADDLE_WEBHOOK_SECRET_KEY,
      'PADDLE_WEBHOOK_SECRET_KEY is required for webhook signature verification.'
    );
    test.skip(
      !webhookEventsAvailable,
      'webhook_events table is missing; run the database migrations before this test.'
    );
    test.slow();

    const locale = 'en';
    const unique = Date.now().toString(36);
    const email = `e2e+${unique}@interdomestik.com`;
    const password = 'TestPassword123!';
    const fullName = `E2E Member ${unique}`;

    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await page.goto(routes.register(locale));
    await page.fill('input[name="fullName"]', fullName);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="confirmPassword"]', password);
    await page.check('#terms');

    await Promise.all([
      page.waitForURL(/\/member/, { timeout: 10_000, waitUntil: 'domcontentloaded' }).catch(() => {
        return null;
      }),
      page.click('button[type="submit"]'),
    ]);

    const registerError = page.locator('div.text-red-500');
    if (await registerError.isVisible()) {
      throw new Error(`Registration failed: ${(await registerError.innerText()).trim()}`);
    }

    let sessionResponse = await page.request.get('/api/auth/get-session');
    const sessionData = (await sessionResponse.json()) as {
      user?: { id?: string; email?: string };
      session?: { user?: { id?: string; email?: string } };
    };
    const sessionUser = sessionData.user ?? sessionData.session?.user;
    let userId = sessionUser?.id;
    if (!userId) {
      await page.goto(routes.login(locale));
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await Promise.all([
        page.waitForURL(/\/member/, { timeout: 10_000, waitUntil: 'domcontentloaded' }),
        page.click('button[type="submit"]'),
      ]);

      sessionResponse = await page.request.get('/api/auth/get-session');
      expect(sessionResponse.ok()).toBeTruthy();
      const refreshedSession = (await sessionResponse.json()) as {
        user?: { id?: string; email?: string };
        session?: { user?: { id?: string; email?: string } };
      };
      const refreshedUser = refreshedSession.user ?? refreshedSession.session?.user;
      if (!refreshedUser?.id) {
        throw new Error('Unable to establish session after registration/login.');
      }
      userId = refreshedUser.id;
    }

    const finalSessionResponse = await page.request.get('/api/auth/get-session');
    const finalSessionData = (await finalSessionResponse.json()) as {
      user?: { id?: string; email?: string };
      session?: { user?: { id?: string; email?: string } };
    };
    const finalSessionUser = finalSessionData.user ?? finalSessionData.session?.user;
    userId = finalSessionUser?.id;
    expect(userId).toBeTruthy();

    await page.addInitScript(() => {
      const checkout = {
        open: (args: unknown) => {
          (window as { __paddleCheckoutArgs?: unknown }).__paddleCheckoutArgs = args;
        },
        updateCheckout: () => {},
        updateItems: () => {},
        close: () => {},
      };
      const paddleMock = {
        Environment: { set: () => {} },
        Initialized: true,
        Initialize: () => {},
        Update: () => {},
        Checkout: checkout,
      };
      (window as { __paddleCheckoutArgs?: unknown }).__paddleCheckoutArgs = null;
      (window as { PaddleBillingV1?: unknown }).PaddleBillingV1 = paddleMock;
      (window as { PaddleClassic?: unknown }).PaddleClassic = paddleMock;
    });

    await page.goto(routes.pricing(locale));

    const joinButton = page.getByRole('button', { name: /Join Now|Bashkohu|Bëhu Anëtar/i }).first();
    await joinButton.click();

    await expect
      .poll(async () =>
        page.evaluate(() => (window as { __paddleCheckoutArgs?: unknown }).__paddleCheckoutArgs)
      )
      .not.toBeNull();

    const checkoutArgs = (await page.evaluate(
      () => (window as { __paddleCheckoutArgs?: unknown }).__paddleCheckoutArgs
    )) as {
      items?: Array<{ priceId?: string }>;
      customData?: { userId?: string };
      settings?: { successUrl?: string };
    };

    const priceId = checkoutArgs.items?.[0]?.priceId;
    const successUrl = checkoutArgs.settings?.successUrl ?? '';

    expect(priceId).toBeTruthy();
    expect(checkoutArgs.customData?.userId).toBe(userId);
    expect(successUrl).toContain('/member/membership/success');

    const now = new Date();
    const subscriptionId = `sub_${unique}`;
    const createdEventId = `evt_${unique}_created`;
    const createdPayload = buildSubscriptionPayload({
      eventType: 'subscription.created',
      eventId: createdEventId,
      subscriptionId,
      userId: userId ?? '',
      status: 'active',
      priceId: priceId ?? 'unknown',
      periodStart: now,
      periodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    });

    const createdResponse = await postPaddleWebhook(page, createdPayload);

    if (!createdResponse.ok()) {
      const errorBody = await createdResponse.text();
      throw new Error(
        `Webhook create failed: ${createdResponse.status()} ${errorBody || '[empty response]'}`
      );
    }

    await page.goto(successUrl);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Interdomestik!/);

    await page.goto(`/${locale}/member/membership`);
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
    await expect(page.getByText(priceId ?? '', { exact: false })).toBeVisible();

    await page.goto(routes.member(locale));
    await expect(page.getByText('Protected', { exact: true })).toBeVisible();

    const cancelResponse = await postPaddleWebhook(
      page,
      buildSubscriptionPayload({
        eventType: 'subscription.canceled',
        eventId: `evt_${unique}_canceled`,
        subscriptionId,
        userId: userId ?? '',
        status: 'canceled',
        priceId: priceId ?? 'unknown',
        periodStart: now,
        periodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      })
    );

    if (!cancelResponse.ok()) {
      const errorBody = await cancelResponse.text();
      throw new Error(
        `Webhook cancel failed: ${cancelResponse.status()} ${errorBody || '[empty response]'}`
      );
    }

    await page.goto(routes.member(locale));
    await expect(page.getByText('No Active Protection', { exact: true })).toBeVisible();

    await page.goto(`/${locale}/member/membership`);
    await expect(page.getByText('No active membership', { exact: true })).toBeVisible();

    await page.goto(`/${locale}/member/membership/card`);
    await expect(page).toHaveURL(/\/member\/membership$/);
  });
});
