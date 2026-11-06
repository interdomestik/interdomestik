import {
  E2E_PASSWORD,
  E2E_USERS,
  db,
  eq,
  inArray,
  memberLeads,
  user,
} from '@interdomestik/database';
import en from '../../src/messages/en/agent.json';
import mk from '../../src/messages/mk/agent.json';
import sq from '../../src/messages/sq/agent.json';
import { removeOwnedMemberLead } from '../utils/owned-member-lead';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

type TenantRegistrationTarget = {
  actorEmail: string;
  adminEmail: string;
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
      adminEmail: E2E_USERS.KS_ADMIN.email,
      expectedTenantId: E2E_USERS.KS_AGENT.tenantId,
      host: siblingTenantHost(projectHost, 'ks'),
      locale: 'sq',
      label: 'ks',
    },
    {
      actorEmail: E2E_USERS.MK_AGENT.email,
      adminEmail: E2E_USERS.MK_ADMIN.email,
      expectedTenantId: E2E_USERS.MK_AGENT.tenantId,
      host: siblingTenantHost(projectHost, 'mk'),
      locale: 'mk',
      label: 'mk',
    },
  ];
}

async function loginActor(
  context: BrowserContext,
  target: TenantRegistrationTarget,
  email = target.actorEmail
): Promise<import('@playwright/test').Page> {
  const page = await context.newPage();
  const origin = `http://${target.host}`;
  const loginURL = `${origin}/api/auth/sign-in/email`;

  const response = await page.request.post(loginURL, {
    data: { email, password: E2E_PASSWORD },
    headers: {
      Origin: origin,
      Referer: `${origin}/${target.locale}/login`,
      'x-forwarded-host': target.host,
    },
  });

  if (!response.ok()) {
    throw new Error(`API login failed for ${email}: ${response.status()} ${await response.text()}`);
  }

  return page;
}

const MORE_ACTIONS: Record<string, string> = {
  en: en.agent.leads_pro.more_actions,
  mk: mk.agent.leads_pro.more_actions,
  sq: sq.agent.leads_pro.more_actions,
};

async function leadIdFor(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: memberLeads.id })
    .from(memberLeads)
    .where(eq(memberLeads.email, email));
  return row?.id ?? null;
}

// The replacement enrollment journey (ACQ-2, owner D1 a): consented lead, then Pay Cash.
async function recordLeadAndTakeCash(
  page: Page,
  target: TenantRegistrationTarget,
  email: string,
  label: string
): Promise<string> {
  await page.goto('agent/leads');
  await expect(page.getByTestId('agent-leads-pro').first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('new-lead-button').click();
  await page.getByTestId('lead-form-firstname').fill('Attribution');
  await page.getByTestId('lead-form-lastname').fill(label);
  await page.getByTestId('lead-form-email').fill(email);
  await page.getByTestId('lead-form-phone').fill('+38344111222');
  await page.getByTestId('lead-form-consent').click();
  await page.getByTestId('lead-form-submit').click();
  await expect.poll(() => leadIdFor(email), { timeout: 20_000 }).not.toBeNull();
  const leadId = (await leadIdFor(email))!;

  await page.reload();
  await page.getByTestId(`lead-row-${leadId}`).filter({ visible: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: MORE_ACTIONS[target.locale] }).click();
  await drawer.getByTestId('pay-cash-button').click();
  await expect
    .poll(
      async () => {
        const [row] = await db
          .select({ status: memberLeads.status })
          .from(memberLeads)
          .where(eq(memberLeads.id, leadId));
        return row?.status;
      },
      { timeout: 20_000 }
    )
    .toBe('payment_pending');
  return leadId;
}

async function approveCash(admin: Page, email: string): Promise<void> {
  await admin.goto(`admin/leads?${new URLSearchParams({ query: email })}`);
  const row = admin
    .getByTestId('cash-verification-row')
    .filter({ visible: true })
    .filter({ has: admin.getByText(email, { exact: true }) });
  await row.getByTestId('cash-approve').click({ timeout: 30_000 });
  // The click does not await the server action: the flow ends once its conversion committed, so
  // cleanup waits for it. Only a conversion slower than this poll can still finish after cleanup.
  await expect
    .poll(
      async () => {
        const [lead] = await db
          .select({ memberId: memberLeads.convertedUserId })
          .from(memberLeads)
          .where(eq(memberLeads.email, email));
        return lead?.memberId ?? null;
      },
      { timeout: 30_000 }
    )
    .not.toBeNull();
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
    const newContext = async (target: TenantRegistrationTarget, ip: string) => {
      const context = await browser.newContext({
        baseURL: `http://${target.host}/${target.locale}/`,
        extraHTTPHeaders: { 'x-forwarded-host': target.host, 'x-forwarded-for': ip },
      });
      contexts.push(context);
      return context;
    };

    try {
      // Every flow settles before the assertions or the cleanup run, so nothing still writes.
      const flows = await Promise.allSettled(
        buildTenantTargets().flatMap((target, tenantIndex) =>
          Array.from({ length: 2 }, async (_, requestIndex) => {
            const ip = `10.20.${tenantIndex}.${requestIndex + 10}`;
            const page = await loginActor(await newContext(target, ip), target);

            const email = `pd05-${target.label}-${tenantIndex}-${requestIndex}-${suffix}@example.com`;
            const retiredEmail = `retired-${email}`;
            expectations.push({ email, expectedTenantId: target.expectedTenantId });
            retiredEmails.push(retiredEmail);

            // ACQ-2 (owner D1 a): direct registration is retired and must refuse without a write.
            const retired = await page.request.post(`http://${target.host}/api/register`, {
              data: { email: retiredEmail, name: 'Retired', planId: 'standard' },
            });
            expect(retired.status()).toBe(410);

            await recordLeadAndTakeCash(page, target, email, `${target.label}-${requestIndex}`);

            const adminIp = `10.21.${tenantIndex}.${requestIndex + 10}`;
            const admin = await loginActor(
              await newContext(target, adminIp),
              target,
              target.adminEmail
            );
            await approveCash(admin, email);
          })
        )
      );
      const failed = flows.find(flow => flow.status === 'rejected');
      if (failed) throw failed.reason;
      const emails = expectations.map(entry => entry.email);

      // Every flow waited for its conversion; each member is in the tenant of its lead's host.
      const members = await db
        .select({ email: user.email, tenantId: user.tenantId, role: user.role })
        .from(user)
        .where(inArray(user.email, emails));
      expect(members).toHaveLength(expectations.length);
      for (const expectation of expectations) {
        const member = members.find(entry => entry.email === expectation.email);
        expect(member?.tenantId).toBe(expectation.expectedTenantId);
        expect(member?.role).toBe('member');
      }

      const retiredUsers = await db
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.email, retiredEmails));
      expect(retiredUsers).toHaveLength(0);
    } finally {
      // Leads are found by the test-owned emails, so a flow that failed midway is cleaned too.
      const owned = await db
        .select({ id: memberLeads.id, email: memberLeads.email })
        .from(memberLeads)
        .where(
          inArray(
            memberLeads.email,
            expectations.map(entry => entry.email)
          )
        );
      for (const lead of owned) await removeOwnedMemberLead(lead);
      await Promise.all(contexts.map(context => context.close()));
    }
  });
});
