import { E2E_PASSWORD, E2E_USERS, db, inArray, memberLeads, user } from '@interdomestik/database';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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

async function createLeadThroughDialog(page: Page, email: string, label: string): Promise<void> {
  await page.goto('agent/leads');
  await expect(page.getByTestId('agent-leads-pro').first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('new-lead-button').click();
  await page.getByTestId('lead-form-firstname').fill('Attribution');
  await page.getByTestId('lead-form-lastname').fill(label);
  await page.getByTestId('lead-form-email').fill(email);
  await page.getByTestId('lead-form-phone').fill('+38344111222');
  await page.getByTestId('lead-form-consent').click();
  await page.getByTestId('lead-form-submit').click();
}

test.describe('Registration tenant attribution', () => {
  test('concurrent tenant-host lead entry keeps tenant attribution; direct registration writes nothing', async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('mk'),
      'Cross-tenant concurrent attribution proof runs once and covers both hosts directly.'
    );

    const suffix = `${Date.now()}`;
    const expectations: RegisteredExpectation[] = [];
    const retiredEmails: string[] = [];
    const contexts: BrowserContext[] = [];

    try {
      await Promise.all(
        buildTenantTargets().flatMap((target, tenantIndex) =>
          Array.from({ length: 2 }, async (_, requestIndex) => {
            const context = await browser.newContext({
              baseURL: `http://${target.host}/${target.locale}/`,
              extraHTTPHeaders: {
                'x-forwarded-host': target.host,
                'x-forwarded-for': `10.20.${tenantIndex}.${requestIndex + 10}`,
              },
            });
            contexts.push(context);
            const page = await loginActor(context, target);

            const email = `pd05-${target.label}-${tenantIndex}-${requestIndex}-${suffix}@example.com`;
            const retiredEmail = `retired-${email}`;
            expectations.push({ email, expectedTenantId: target.expectedTenantId });
            retiredEmails.push(retiredEmail);

            // ACQ-2 (owner D1 a): direct registration is retired and must refuse without a write.
            const retired = await page.request.post(`http://${target.host}/api/register`, {
              data: { email: retiredEmail, name: 'Retired', planId: 'standard' },
            });
            expect(retired.status()).toBe(410);

            await createLeadThroughDialog(page, email, `${target.label}-${requestIndex}`);
          })
        )
      );

      await expect
        .poll(
          async () =>
            (
              await db
                .select({ email: memberLeads.email })
                .from(memberLeads)
                .where(
                  inArray(
                    memberLeads.email,
                    expectations.map(entry => entry.email)
                  )
                )
            ).length,
          { timeout: 20_000 }
        )
        .toBe(expectations.length);

      const leads = await db
        .select({ email: memberLeads.email, tenantId: memberLeads.tenantId })
        .from(memberLeads)
        .where(
          inArray(
            memberLeads.email,
            expectations.map(entry => entry.email)
          )
        );
      for (const expectation of expectations) {
        const inserted = leads.find(entry => entry.email === expectation.email);
        expect(inserted?.tenantId).toBe(expectation.expectedTenantId);
      }

      const retiredUsers = await db
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.email, retiredEmails));
      expect(retiredUsers).toHaveLength(0);
    } finally {
      const emails = expectations.map(entry => entry.email);
      if (emails.length > 0) await db.delete(memberLeads).where(inArray(memberLeads.email, emails));
      await Promise.all(contexts.map(context => context.close()));
    }
  });
});
