import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { settleFrames } from './information-request-read-result.fixture';
import { visible } from './staff-case-workspace-presentation';
import {
  FILTERS,
  SEARCH_TERM,
  catalogFor,
  until,
  openClaims,
  expectRetainedUrl,
  expectFailed,
  expectPending,
  expectAnnounced,
  expectNarrowFit,
  withSeam,
} from './admin-claims-read-recovery.fixture';

test.describe('S7 admin claims read recovery', () => {
  test('keyboard recovery announces actual populated results and focuses the claims region', async ({
    adminPage: page,
  }, testInfo) => {
    const catalog = catalogFor(testInfo);
    await withSeam(page, testInfo, catalog, async (seam, pathname) => {
      const parts = await openClaims(page, testInfo, catalog);
      const cards = await parts.cards.count();
      expect(cards, 'the required seeded tenant has a claim to recover').toBeGreaterThan(0);
      // Select one member of the verified seeded collection, then require its sole title.
      const title = parts.cards.nth(0).getByRole('heading', { level: 3 });
      await expect(title).toHaveCount(1);
      const search = (await title.textContent())?.trim();
      if (!search) throw new Error('Seeded claim title is empty');

      seam.arm({ kind: 'failure' });
      await parts.search.fill(search);
      await until(seam, 'matching native search read was failed', c => c.failed === 1);
      await expectFailed(parts, catalog, { retried: false, draft: search });
      expectRetainedUrl(page, pathname, { search });
      const url = page.url();

      seam.arm({ kind: 'passthrough' });
      await parts.retry.focus();
      await page.keyboard.press('Enter');
      await until(seam, 'populated successful read was delivered', c => c.passed === 1);
      expect(await expectAnnounced(parts, seam, catalog)).toBeGreaterThan(0);
      expect(await parts.cards.count()).toBeGreaterThan(0);
      await expect(parts.region).toBeFocused();
      await expect(parts.search).toHaveValue(search);
      expect(page.url()).toBe(url);
    });
  });

  test('keyboard retry keeps the filters, pends once and announces the settled read', async ({
    adminPage: page,
  }, testInfo) => {
    const catalog = catalogFor(testInfo);
    await withSeam(page, testInfo, catalog, async (seam, pathname) => {
      const parts = await openClaims(page, testInfo, catalog, FILTERS);

      // A native search navigation is the one read that is failed.
      seam.arm({ kind: 'failure' });
      await parts.search.fill(SEARCH_TERM);
      await until(seam, 'native search read was failed', c => c.failed === 1);
      await expectFailed(parts, catalog, { retried: false, draft: SEARCH_TERM });
      expectRetainedUrl(page, pathname, { ...FILTERS, search: SEARCH_TERM });
      const assigned = visible(page, 'assigned-filter-unassigned');
      await expect(assigned).toHaveAttribute('aria-pressed', 'true');
      await expect(visible(page, 'diaspora-filter-diaspora')).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      // Held failed retry: pending once, repeat activation reads nothing, failure is retained.
      const before = seam.counts().eligible;
      seam.arm({ kind: 'failure', hold: true });
      await parts.retry.focus();
      await expect(parts.retry).toBeFocused();
      await page.keyboard.press('Enter');
      await until(seam, 'held failed read reached the server', c => c.awaitingRelease);
      await expectPending(parts, catalog);
      await page.keyboard.press('Enter');
      await settleFrames(page);
      expect(seam.counts().eligible).toBe(before + 1);
      await expectPending(parts, catalog);
      seam.release();
      await until(seam, 'held failure was delivered', c => c.failed === 2);
      await expectFailed(parts, catalog, { retried: true, draft: SEARCH_TERM });
      expectRetainedUrl(page, pathname, { ...FILTERS, search: SEARCH_TERM });

      // Actual pass: error gone, count announced, region owns focus, URL and filters unchanged.
      const url = page.url();
      seam.arm({ kind: 'passthrough' });
      await parts.retry.focus();
      await expect(parts.retry).toBeFocused();
      await page.keyboard.press('Enter');
      await until(seam, 'successful read was delivered', c => c.passed === 1);
      await expectAnnounced(parts, seam, catalog);
      await expect(parts.region).toBeFocused();
      expect(page.url()).toBe(url);
      await expect(parts.search).toHaveValue(SEARCH_TERM);
      await expect(assigned).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test('pointer retry announces a true empty read and a newer control keeps focus', async ({
    adminPage: page,
  }, testInfo) => {
    const catalog = catalogFor(testInfo);
    const noMatch = `s7-no-match-${randomUUID()}`;
    await withSeam(page, testInfo, catalog, async (seam, pathname) => {
      const parts = await openClaims(page, testInfo, catalog);
      const announced = (await parts.result.textContent()) ?? '';
      const baseline = Number(catalog.resultPattern.exec(announced)?.[1]);
      expect(Number.isInteger(baseline), 'healthy page announces its total').toBe(true);
      expect(await parts.cards.count()).toBeLessThanOrEqual(baseline);

      seam.arm({ kind: 'failure' });
      await parts.search.fill(noMatch);
      await until(seam, 'native search read was failed', c => c.failed === 1);
      await expectFailed(parts, catalog, { retried: false, draft: noMatch });
      expectRetainedUrl(page, pathname, { search: noMatch });
      await expectNarrowFit(page, parts, testInfo);

      // Pointer retry to a genuine no-match: zero announced, true empty, no alert, no forced focus.
      seam.arm({ kind: 'passthrough' });
      await parts.retry.click();
      await until(seam, 'no-match read was delivered', c => c.passed === 1);
      expect(await expectAnnounced(parts, seam, catalog)).toBe(0);
      await expect(parts.region).not.toBeFocused();
      await expect(parts.retry).toHaveCount(0);

      // A filter navigation fails again; a newer control takes focus during the held keyboard pass.
      seam.arm({ kind: 'failure' });
      await visible(page, 'assigned-filter-unassigned').click();
      await until(seam, 'native filter read was failed', c => c.failed === 2);
      await expectFailed(parts, catalog, { retried: false, draft: noMatch });
      expectRetainedUrl(page, pathname, { search: noMatch, assigned: 'unassigned' });

      seam.arm({ kind: 'passthrough', hold: true });
      await parts.retry.focus();
      await expect(parts.retry).toBeFocused();
      await page.keyboard.press('Enter');
      await until(seam, 'held successful read reached the server', c => c.awaitingRelease);
      await expectPending(parts, catalog);
      await parts.search.focus();
      await expect(parts.search).toBeFocused();
      seam.release();
      await until(seam, 'held successful read was delivered', c => c.passed === 2);
      expect(await expectAnnounced(parts, seam, catalog)).toBe(0);
      await expect(parts.search).toBeFocused();
      await expect(parts.region).not.toBeFocused();
    });
  });
});
