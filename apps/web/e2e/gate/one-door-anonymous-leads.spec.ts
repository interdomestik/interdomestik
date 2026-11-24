import { randomUUID } from 'node:crypto';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect, fillBusinessIntake } from '../fixtures/one-door.fixture';
import { businessEffects, removeBusinessEffects } from '../fixtures/one-door-data.fixture';
import { withDoorLeadOwner } from '../fixtures/one-door-lead-owner.fixture';
import { gotoApp } from '../utils/navigation';

const roster = ['tenant_ks', 'tenant_mk', 'pilot-mk'] as const;
const modes = ['choice', 'hint', 'matching'] as const;
const configuredTenant = process.env.DEFAULT_PUBLIC_TENANT_ID || 'tenant_ks';
const doorTenant = roster.find(tenant => tenant === configuredTenant);
if (!doorTenant)
  throw new Error('One-door business intake proof requires a seeded admission tenant');

const admissions = [
  { name: 'the door', tenant: doorTenant },
  { name: 'the MK country host', tenant: 'tenant_mk', project: 'gate-mk-contract' },
] as const;

function bookingHint(tenant: string) {
  return `?default_booking_tenant_id=${tenant}`;
}

async function openIntake(
  door: { page: Page; origin: string; locale: string },
  info: TestInfo,
  admission: (typeof admissions)[number],
  query: string,
  ambientTenant: string
) {
  const baseURL =
    'project' in admission
      ? info.config.projects.find(project => project.name === admission.project)?.use.baseURL
      : door.origin;
  if (!baseURL) throw new Error(`Missing base URL for ${admission.name}`);
  const { origin } = new URL(baseURL);
  const cookie = { name: 'tenantId', value: ambientTenant, url: origin };
  await door.page.context().addCookies([cookie]);
  await gotoApp(door.page, `/${door.locale}/business-membership${query}`, info, {
    baseURL: origin,
    marker: 'business-membership-page-ready',
  });
  expect(new URL(door.page.url()).origin).toBe(origin);
  await door.page.context().addCookies([cookie]);
  const choice = door.page.locator('select[name="onboardingTenant"]');
  await expect(choice.locator('option')).toHaveCount(2);
  expect(
    await choice.locator('option').evaluateAll(options => options.map(o => o.getAttribute('value')))
  ).toEqual(['', admission.tenant]);
  await expect(choice).toHaveValue('');
  return choice;
}

async function selectForgedChoice(choice: Locator, tenant: string) {
  await choice.evaluate((select, value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }, tenant);
  await choice.selectOption(tenant);
  await expect(choice).toHaveValue(tenant);
}

test.describe('anonymous business ownership follows public admission', () => {
  for (const admission of admissions) {
    for (const mode of modes) {
      test(`${admission.name} accepts admission tenant ${admission.tenant} by ${mode} without ambient ownership`, async ({
        door,
      }, info) => {
        const tenantId = admission.tenant;
        const email = `door-${randomUUID()}@example.invalid`;
        const keys: string[] = [];
        await withDoorLeadOwner(tenantId, async owner => {
          try {
            const query = mode === 'choice' ? '' : bookingHint(tenantId);
            const choice = await openIntake(door, info, admission, query, 'tenant_al');
            await fillBusinessIntake(door.page, email);
            if (mode !== 'hint') await choice.selectOption(tenantId);
            const key = await door.page.locator('[name="_idempotencyKey"]').inputValue();
            keys.push(key);
            await door.page.locator('form button[type="submit"]').click();
            await expect
              .poll(() => businessEffects(email, key))
              .toMatchObject({
                leads: [
                  {
                    tenantId,
                    captureChannel: 'public_form',
                    leadKind: 'company',
                    agentId: owner.agentId,
                    branchId: owner.branchId,
                  },
                ],
                reservations: [{ tenantId, status: 'completed' }],
              });
          } finally {
            await removeBusinessEffects(email, keys);
          }
        });
      });
    }
  }

  const [doorAdmission, mkAdmission] = admissions;
  const foreignTenants = roster.filter(tenant => tenant !== doorTenant);
  const foreignHint = foreignTenants[0];
  const negatives = [
    { label: 'missing despite stale selectors', query: '?tenantId=tenant_ks', choice: '' },
    { label: 'unsupported hint', query: bookingHint('tenant_al'), choice: '' },
    { label: 'malformed hint', query: bookingHint('%20tenant_mk'), choice: '' },
    { label: 'empty hint', query: bookingHint(''), choice: '' },
    {
      label: 'duplicate hint',
      query: '?default_booking_tenant_id=tenant_mk&default_booking_tenant_id=tenant_mk',
      choice: '',
    },
    {
      label: 'conflicting hints',
      query: '?default_booking_tenant_id=tenant_mk&default_booking_tenant_id=pilot-mk',
      choice: '',
    },
    {
      label: 'conflicting deliberate choice on the door',
      query: bookingHint(foreignHint),
      choice: doorTenant,
    },
    {
      label: 'duplicate deliberate choice on the door',
      query: '',
      choice: doorTenant,
      duplicate: true,
    },
    {
      label: 'conflicting deliberate choice on the MK country host',
      query: bookingHint('pilot-mk'),
      choice: 'tenant_mk',
      admission: mkAdmission,
    },
    {
      label: 'duplicate deliberate choice on the MK country host',
      query: '',
      choice: 'tenant_mk',
      duplicate: true,
      admission: mkAdmission,
    },
    { label: 'unsupported deliberate choice', query: '', choice: 'tenant_al', forged: true },
    ...foreignTenants.flatMap(tenant =>
      modes.map(mode => ({
        label: `${mode} for foreign tenant ${tenant} on the door`,
        query: mode === 'choice' ? '' : bookingHint(tenant),
        choice: mode === 'hint' ? '' : tenant,
        forged: mode !== 'hint',
      }))
    ),
  ] as const;

  for (const example of negatives) {
    test(`rejects ${example.label} before lead or reservation writes`, async ({ door }, info) => {
      const email = `door-negative-${randomUUID()}@example.invalid`;
      const keys: string[] = [];
      try {
        const admission = 'admission' in example ? example.admission : doorAdmission;
        const choice = await openIntake(door, info, admission, example.query, 'tenant_ks');
        await fillBusinessIntake(door.page, email);
        if ('forged' in example && example.forged) {
          await selectForgedChoice(choice, example.choice);
        } else if (example.choice) {
          await choice.selectOption(example.choice);
        }
        if ('duplicate' in example) {
          await door.page.locator('form').evaluate((form, value) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'onboardingTenant';
            input.value = value;
            form.append(input);
          }, example.choice);
        }
        const key = await door.page.locator('[name="_idempotencyKey"]').inputValue();
        keys.push(key);
        expect(await businessEffects(email, key)).toEqual({ leads: [], reservations: [] });
        const [response] = await Promise.all([
          door.page.waitForResponse(
            result =>
              result.request().method() === 'POST' &&
              Boolean(result.request().headers()['next-action'])
          ),
          door.page.locator('form button[type="submit"]').click(),
        ]);
        expect(response.status()).toBe(200);
        await expect(choice).toHaveAttribute('aria-invalid', 'true');
        expect(await businessEffects(email, key)).toEqual({ leads: [], reservations: [] });
      } finally {
        await removeBusinessEffects(email, keys);
      }
    });
  }
});

// CallMeNowDialog intentionally has no production mount. Its callback writer is proven by
// leads.classification.test.ts only; these browser cases claim business-form coverage.

// Inactive-directory and reauthorization denials execute in business-membership-lead.classification.test.ts.
// A genuine inactive browser case requires an isolated app/database; do not deactivate one of
// the shared three pilot tenants while concurrent gates use the same roster.
