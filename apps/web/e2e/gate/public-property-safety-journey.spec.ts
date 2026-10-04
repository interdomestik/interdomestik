import {
  PUBLIC_FACTS_COPY as COPY,
  createPublicFactsEntry,
  expectNoOverflow,
  expectUsefulArrival,
  expectReadableControls,
  expectKeyboardSafetyReturn,
} from '../fixtures/public-intake-arrival';
import { expect, test } from '@playwright/test';

import { withAnonymousPage } from '../utils/anonymous-context';

const localeMatrix = [
  { locale: 'sq', width: 360, height: 800 },
  { locale: 'en', width: 375, height: 812 },
  { locale: 'sr', width: 390, height: 844 },
  { locale: 'mk', width: 430, height: 860 },
  { locale: 'sq', width: 844, height: 390 },
  { locale: 'sq', width: 1440, height: 1024 },
] as const;

const openPropertyEntry = createPublicFactsEntry('property');

test.describe('public property reporting entry', () => {
  test('opens the property facts in every locale with readable mobile controls', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      for (const entry of localeMatrix) {
        await page.setViewportSize({ width: entry.width, height: entry.height });
        const organizer = await openPropertyEntry(page, info, entry.locale);
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

  test('keeps the danger advice visible with the EU-qualified 112 message', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      const organizer = await openPropertyEntry(page, info);
      const advice = organizer.getByTestId('free-start-urgent-advice');

      await expect(advice).toContainText('largohuni nga rreziku');
      await expect(advice).toContainText('Mos hyni përsëri');
      await expect(advice).toContainText('Nëse ndodheni në BE');
      // The advice sits above the facts editor instead of gating it.
      const position = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="free-start-urgent-advice"]');
        const editor = document.querySelector('[data-testid="free-start-recovery-editor"]');
        if (!node || !editor) return 0;
        return node.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING;
      });
      expect(position).not.toBe(0);
    });
  });

  test('keeps the entry transient and starts the property facts without extra questions', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      const organizer = await openPropertyEntry(page, info);
      await expect(page).toHaveURL(/#free-start-intake$/);
      const initialUrl = page.url();
      const egress: string[] = [];
      page.on('request', request => {
        if (['fetch', 'xhr'].includes(request.resourceType())) egress.push(request.url());
      });

      await expect(page.getByTestId('property-safety-journey')).toHaveCount(0);
      await expect(page.getByLabel('Shteti ku ndodhet prona')).toHaveCount(0);
      await expect(organizer.getByTestId('free-start-category-property')).toHaveCount(0);
      await expect(organizer.getByText('Po vazhdoni për:')).toBeVisible();

      const narrative = organizer.getByLabel(COPY.sq.narrative);
      await narrative.click();
      await narrative.fill('Uji dëmtoi garazhën dhe sallonin.');
      await expect(narrative).toBeFocused();
      await expect(narrative).toHaveValue('Uji dëmtoi garazhën dhe sallonin.');
      expect(page.url()).toBe(initialUrl);
      expect(egress).toEqual([]);
    });
  });

  test('reflows at 200 percent zoom and with expanded text spacing', async ({ browser }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 768, height: 900 });
      const organizer = await openPropertyEntry(page, info);
      await page.locator('html').evaluate(element => {
        element.style.zoom = '2';
        element.style.letterSpacing = '0.12em';
        element.style.wordSpacing = '0.16em';
        element.style.lineHeight = '1.5';
      });

      await expect(organizer.getByRole('heading', { name: COPY.sq.advice })).toBeVisible();
      await expect(organizer.getByLabel(COPY.sq.narrative)).toBeVisible();
      await expectNoOverflow(organizer);
    });
  });

  test('keyboard and same-hash arrival keep safety reachable and retain the facts', async ({
    browser,
  }, info) => {
    await withAnonymousPage(browser, info, async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const organizer = await openPropertyEntry(page, info, 'sq', true);
      await expectKeyboardSafetyReturn(page, organizer, 'property', COPY.sq);
    });
  });
});
