import { randomUUID } from 'node:crypto';
import { test, expect, fillBusinessIntake } from '../fixtures/one-door.fixture';
import { businessEffects, removeBusinessEffects } from '../fixtures/one-door-data.fixture';
import { withDoorLeadOwner } from '../fixtures/one-door-lead-owner.fixture';
import { gotoApp } from '../utils/navigation';

const roster = ['tenant_ks', 'tenant_mk', 'pilot-mk'] as const;

test.describe('one-door anonymous business ownership', () => {
  roster.forEach(tenantId => {
    ['choice', 'hint', 'matching'].forEach(mode => {
      test(`${mode} classifies ${tenantId} without ambient ownership`, async ({ door }, info) => {
        const email = `door-${randomUUID()}@example.invalid`;
        const keys: string[] = [];
        await withDoorLeadOwner(tenantId, async owner => {
          try {
            await door.page
              .context()
              .addCookies([{ name: 'tenantId', value: 'tenant_al', url: door.origin }]);
            const query = mode === 'choice' ? '' : `?default_booking_tenant_id=${tenantId}`;
            await gotoApp(door.page, `/${door.locale}/business-membership${query}`, info, {
              baseURL: door.origin,
              marker: 'business-membership-page-ready',
            });
            await fillBusinessIntake(door.page, email);
            if (mode !== 'hint')
              await door.page.locator('select[name="onboardingTenant"]').selectOption(tenantId);
            const key = await door.page.locator('[name="_idempotencyKey"]').inputValue();
            keys.push(key);
            await door.page.locator('form button[type="submit"]').click();
            await expect.poll(async () => (await businessEffects(email, key)).leads.length).toBe(1);
            const effects = await businessEffects(email, key);
            expect(effects.leads[0]).toMatchObject({
              tenantId,
              captureChannel: 'public_form',
              leadKind: 'company',
              agentId: owner.agentId,
              branchId: owner.branchId,
            });
            expect(effects.reservations).toHaveLength(1);
            expect(effects.reservations[0]).toMatchObject({ tenantId, status: 'completed' });
          } finally {
            await removeBusinessEffects(email, keys);
          }
        });
      });
    });
  });

  const negatives = [
    { label: 'missing despite stale selectors', query: '?tenantId=tenant_ks', choice: '' },
    { label: 'unsupported hint', query: '?default_booking_tenant_id=tenant_al', choice: '' },
    { label: 'malformed hint', query: '?default_booking_tenant_id=%20tenant_mk', choice: '' },
    { label: 'empty hint', query: '?default_booking_tenant_id=', choice: '' },
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
      label: 'conflicting deliberate choice',
      query: '?default_booking_tenant_id=pilot-mk',
      choice: 'tenant_mk',
    },
    { label: 'duplicate deliberate choice', query: '', choice: 'tenant_mk', duplicate: true },
    { label: 'unsupported deliberate choice', query: '', choice: 'tenant_al', forged: true },
  ] as const;
  negatives.forEach(example => {
    test(`rejects ${example.label} before lead or reservation writes`, async ({ door }, info) => {
      const email = `door-negative-${randomUUID()}@example.invalid`;
      const keys: string[] = [];
      try {
        await door.page
          .context()
          .addCookies([{ name: 'tenantId', value: 'tenant_ks', url: door.origin }]);
        await gotoApp(door.page, `/${door.locale}/business-membership${example.query}`, info, {
          baseURL: door.origin,
          marker: 'business-membership-page-ready',
        });
        await fillBusinessIntake(door.page, email);
        if ('forged' in example) {
          await door.page.locator('select[name="onboardingTenant"]').evaluate((element, value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            element.append(option);
          }, example.choice);
        }
        if (example.choice)
          await door.page.locator('select[name="onboardingTenant"]').selectOption(example.choice);
        if ('duplicate' in example) {
          await door.page.locator('form').evaluate(form => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'onboardingTenant';
            input.value = 'tenant_mk';
            form.append(input);
          });
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
        await expect(door.page.locator('select[name="onboardingTenant"]')).toHaveAttribute(
          'aria-invalid',
          'true'
        );
        expect(await businessEffects(email, key)).toEqual({ leads: [], reservations: [] });
      } finally {
        await removeBusinessEffects(email, keys);
      }
    });
  });
});

// CallMeNowDialog intentionally has no production mount. Its callback writer is proven by
// leads.classification.test.ts only; these browser cases claim business-form coverage.

// Inactive-directory and reauthorization denials execute in business-membership-lead.classification.test.ts.
// A genuine inactive browser case requires an isolated app/database; do not deactivate one of
// the shared three pilot tenants while concurrent gates use the same roster.
