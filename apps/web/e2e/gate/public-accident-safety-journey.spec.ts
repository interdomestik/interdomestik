import {
  PUBLIC_FACTS_COPY as COPY,
  createPublicFactsEntry,
  expectNoOverflow,
  expectUsefulArrival,
  expectReadableControls,
  expectKeyboardSafetyReturn,
} from '../fixtures/public-intake-arrival';
import { expect, test, type Page } from '@playwright/test';

import { withAnonymousPage } from '../utils/anonymous-context';

const localeMatrix = [
  { locale: 'sq', width: 320, height: 720 },
  { locale: 'en', width: 375, height: 812 },
  { locale: 'sr', width: 390, height: 844 },
  { locale: 'mk', width: 768, height: 900 },
  { locale: 'sq', width: 1024, height: 768 },
  { locale: 'sq', width: 1440, height: 900 },
  { locale: 'sq', width: 844, height: 390 },
] as const;

const openVehicleEntry = createPublicFactsEntry('vehicle');

async function expectAdviceAbove(page: Page, testId: string) {
  const position = await page.evaluate(selector => {
    const advice = document.querySelector('[data-testid="free-start-urgent-advice"]');
    const target = document.querySelector(selector);
    if (!advice || !target) return 0;
    return advice.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING;
  }, `[data-testid="${testId}"]`);
  expect(position).not.toBe(0);
}

test.describe('public vehicle reporting entry', () => {
  test('opens the vehicle facts in every locale and reflows at the required mobile widths', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      for (const entry of localeMatrix) {
        await page.setViewportSize({ width: entry.width, height: entry.height });
        const organizer = await openVehicleEntry(page, info, entry.locale);
        const copy = COPY[entry.locale];
        const narrative = organizer.getByLabel(copy.narrative);
        await expect(organizer.getByRole('heading', { name: copy.advice })).toBeVisible();
        await expect(narrative).toBeVisible();
        // One hero selection has to land the first narrative in view without any manual scrolling.
        await expect(narrative).toBeInViewport();
        await expectUsefulArrival(page, organizer, copy.narrative, copy.advice);
        await expectNoOverflow(page.locator('html'));
        await expectNoOverflow(organizer);

        await expectReadableControls(
          organizer,
          organizer.getByTestId('free-start-recovery-editor')
        );
      }
    });
  });

  test('explains the problem first, with qualified urgent advice and no transmission', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      const organizer = await openVehicleEntry(page, info);
      const initialUrl = page.url();
      const egress: string[] = [];
      page.on('request', request => {
        if (['fetch', 'xhr'].includes(request.resourceType())) egress.push(request.url());
      });

      const advice = organizer.getByTestId('free-start-urgent-advice');
      await expect(advice).toContainText('kërkoni menjëherë vlerësim profesional ose emergjent');
      await expect(advice).toContainText('mos e lëvizni veturën');
      await expect(advice).toContainText('Nëse ndodheni në BE');
      // The removed question stages are gone, not merely hidden behind another click.
      await expect(page.getByTestId('accident-safety-journey')).toHaveCount(0);
      await expect(page.getByLabel('Shteti ku ndodhi aksidenti')).toHaveCount(0);
      await expect(organizer.getByTestId('free-start-category-vehicle')).toHaveCount(0);

      const narrative = organizer.getByLabel(COPY.sq.narrative);
      await narrative.click();
      await narrative.fill('Vetura u dëmtua në parking dhe siguruesi nuk përgjigjet.');
      await expect(narrative).toBeFocused();
      await expect(narrative).toHaveValue(
        'Vetura u dëmtua në parking dhe siguruesi nuk përgjigjet.'
      );
      expect(page.url()).toBe(initialUrl);
      expect(egress).toEqual([]);
    });
  });

  test('keeps the injury and movement advice above the facts editor', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openVehicleEntry(page, info);
      await expectAdviceAbove(page, 'free-start-recovery-editor');
    });
  });

  test('keeps the first narrative readable at a 200 percent zoom proxy', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 768, height: 900 });
      const organizer = await openVehicleEntry(page, info);
      await page.locator('html').evaluate(element => {
        element.style.zoom = '2';
      });

      await expect(organizer.getByRole('heading', { name: COPY.sq.advice })).toBeVisible();
      await expect(organizer.getByLabel(COPY.sq.narrative)).toBeVisible();
      await expectNoOverflow(organizer);
    });
  });

  test('browser back keeps the entered facts instead of restoring a removed stage', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const organizer = await openVehicleEntry(page, info);
      const narrative = organizer.getByLabel(COPY.sq.narrative);
      await narrative.fill('Dëmtim në parking.');
      await page.goBack();

      await expect(page.getByTestId('accident-safety-journey')).toHaveCount(0);
      await expect(page.getByTestId('free-start-intake-shell')).toBeVisible();
      await expect(organizer.getByLabel(COPY.sq.narrative)).toHaveValue('Dëmtim në parking.');
    });
  });

  test('keyboard and same-hash arrival keep safety reachable and retain the facts', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const organizer = await openVehicleEntry(page, info, 'sq', true);
      await expectKeyboardSafetyReturn(page, organizer, 'vehicle', COPY.sq);
    });
  });
});
