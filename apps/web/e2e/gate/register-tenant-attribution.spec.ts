import {
  E2E_PASSWORD,
  E2E_USERS,
  account,
  agentClients,
  db,
  inArray,
  subscriptions,
  user,
} from '@interdomestik/database';
import { expect, test, type BrowserContext } from '@playwright/test';

type TenantRegistrationTarget = {
  actorEmail: string;
  expectedTenantId: string;
  host: string;
  locale: string;
  label: 'ks' | 'mk';
};

type RegisteredExpectation = {
  email: string;
  expectedTenantId: string;
};

function requireProjectHost(): string {
  const forwardedHost = test.info().project.use.extraHTTPHeaders?.['x-forwarded-host'];
  if (typeof forwardedHost === 'string' && forwardedHost.trim().length > 0) {
    return forwardedHost;
  }

  const baseURL = test.info().project.use.baseURL?.toString();
  if (baseURL) {
    return new URL(baseURL).host;
  }

  throw new Error('Expected project.use.baseURL or x-forwarded-host for tenant host resolution.');
}

function siblingTenantHost(host: string, targetLabel: 'ks' | 'mk'): string {
  const normalized = host.toLowerCase();
  if (targetLabel === 'ks') {
    if (normalized.startsWith('mk.')) {
      return `ks.${host.slice(3)}`;
    }
    if (normalized.startsWith('ks.')) {
      return host;
    }
  }

  if (targetLabel === 'mk') {
    if (normalized.startsWith('ks.')) {
      return `mk.${host.slice(3)}`;
    }
    if (normalized.startsWith('mk.')) {
      return host;
    }
  }

  throw new Error(`Unable to derive ${targetLabel} tenant host from project host: ${host}`);
}

function buildTenantTargets(): TenantRegistrationTarget[] {
  const projectHost = requireProjectHost();
  return [
    {
      actorEmail: E2E_USERS.KS_AGENT.email,
      expectedTenantId: E2E_USERS.KS_AGENT.tenantId,
      host: siblingTenantHost(projectHost, 'ks'),
      locale: 'sq',
      label: 'ks',
    },
    {
      actorEmail: E2E_USERS.MK_AGENT.email,
      expectedTenantId: E2E_USERS.MK_AGENT.tenantId,
      host: siblingTenantHost(projectHost, 'mk'),
      locale: 'mk',
      label: 'mk',
    },
  ];
}

async function loginActor(
  context: BrowserContext,
  target: TenantRegistrationTarget
): Promise<import('@playwright/test').Page> {
  const page = await context.newPage();
  const origin = `http://${target.host}`;
  const loginURL = `${origin}/api/auth/sign-in/email`;

  const response = await page.request.post(loginURL, {
    data: { email: target.actorEmail, password: E2E_PASSWORD },
    headers: {
      Origin: origin,
      Referer: `${origin}/${target.locale}/login`,
      'x-forwarded-host': target.host,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `API login failed for ${target.actorEmail}: ${response.status()} ${await response.text()}`
    );
  }

  return page;
}

async function cleanupRegisteredUsers(emails: string[]) {
  const insertedUsers = await db.query.user.findMany({
    where: (table, { inArray: inArrayInner }) => inArrayInner(table.email, emails),
    columns: { id: true, email: true },
  });

  if (insertedUsers.length === 0) {
    return;
  }

  const userIds = insertedUsers.map(entry => entry.id);

  await db.delete(agentClients).where(inArray(agentClients.memberId, userIds));
  await db.delete(subscriptions).where(inArray(subscriptions.userId, userIds));
  await db.delete(account).where(inArray(account.userId, userIds));
  await db.delete(user).where(inArray(user.id, userIds));
}

test.describe('Registration tenant attribution', () => {
  test('concurrent tenant-host registrations preserve persisted tenant attribution', async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('mk'),
      'Cross-tenant concurrent attribution proof runs once and covers both hosts directly.'
    );

    const suffix = `${Date.now()}`;
    const expectations: RegisteredExpectation[] = [];
    const contexts: BrowserContext[] = [];

    try {
      const requests = await Promise.all(
        buildTenantTargets().flatMap((target, tenantIndex) =>
          Array.from({ length: 3 }, async (_, requestIndex) => {
            const context = await browser.newContext({
              baseURL: `http://${target.host}/${target.locale}`,
              extraHTTPHeaders: {
                'x-forwarded-host': target.host,
              },
            });
            contexts.push(context);
            const page = await loginActor(context, target);

            const email = `pd05-${target.label}-${tenantIndex}-${requestIndex}-${suffix}@example.com`;
            expectations.push({
              email,
              expectedTenantId: target.expectedTenantId,
            });

            return page.request.post('/api/register', {
              data: {
                email,
                name: `PD05 ${target.label.toUpperCase()} ${requestIndex}`,
                role: 'user',
                password: 'GoldenPass123!',
                phone: `+38344111${tenantIndex}${requestIndex}${suffix.slice(-2)}`,
                planId: 'standard',
              },
              headers: {
                'x-forwarded-host': target.host,
                'x-forwarded-for': `10.20.${tenantIndex}.${requestIndex + 10}`,
              },
            });
          })
        )
      );

      for (const response of requests) {
        const body = await response.json();
        expect(response.status()).toBe(200);
        expect(body, `Unexpected register payload: ${JSON.stringify(body)}`).toMatchObject({
          ok: true,
        });
      }

      const insertedUsers = await db.query.user.findMany({
        where: (table, { inArray: inArrayInner }) =>
          inArrayInner(
            table.email,
            expectations.map(entry => entry.email)
          ),
        columns: { email: true, tenantId: true, role: true },
      });

      expect(insertedUsers).toHaveLength(expectations.length);

      for (const expectation of expectations) {
        const inserted = insertedUsers.find(entry => entry.email === expectation.email);
        expect(inserted?.tenantId).toBe(expectation.expectedTenantId);
        expect(inserted?.role).toBe('member');
      }
    } finally {
      await cleanupRegisteredUsers(expectations.map(entry => entry.email));
      await Promise.all(contexts.map(context => context.close()));
    }
  });
});
