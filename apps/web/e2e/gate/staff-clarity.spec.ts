import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('C0.5: Staff Clarity Hardening', () => {
  test('staff canonical route shows v3 readiness marker and no legacy banner', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('staff');
    const target = routes.staffClaims(testInfo);

    // Canonical route check
    await gotoApp(page, target, testInfo, { marker: 'staff-page-ready' });
    await expect(page).toHaveURL(new RegExp(`${target}$`));

    // V3 Markers check
    await expect(page.locator('[data-testid="staff-page-ready"]:visible')).toBeVisible();
    await expect(page.getByTestId('portal-surface-indicator')).toBeVisible();

    // No Legacy Banner check
    await expect(page.getByTestId('legacy-banner')).toHaveCount(0);
  });

  test('staff explicit searches release completed controls for another search and clear', async ({
    staffPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.staffClaims(testInfo), testInfo, { marker: 'staff-page-ready' });
    const ready = page.getByTestId('staff-page-ready').filter({ visible: true });
    await expect(ready).toHaveCount(1);
    const filters = ready.getByTestId('staff-claims-filters');
    const form = filters.getByTestId('staff-claims-search-form');
    const input = form.getByTestId('staff-claims-search-input');
    const submit = form.getByTestId('staff-claims-search-submit');
    await expect(filters).toHaveCount(1);
    await expect(form).toHaveCount(1);
    const titles = (await ready.getByTestId('staff-claim-title').allTextContents()).map(title =>
      title.trim()
    );
    expect(titles.length).toBeGreaterThan(0);
    // Select an actual permitted seeded title whose substring search has one clear owner.
    const title = titles.find(
      candidate =>
        candidate &&
        titles.filter(value => value.toLowerCase().includes(candidate.toLowerCase())).length === 1
    );
    expect(title).toBeTruthy();
    if (!title) throw new Error('Expected a uniquely searchable permitted staff seed title');
    const originalCount = titles.length;
    const initialUrl = page.url();
    await input.fill(`  ${title}  `);
    expect(page.url()).toBe(initialUrl);
    await input.press('Enter');
    await expect(page).toHaveURL(url => url.searchParams.get('search') === title);
    await expect(ready.getByTestId('staff-claim-title')).toHaveText([title]);
    // Default assertion timeout is below the old10s-only release, without a latency-budget claim.
    await expect(submit).toBeEnabled();
    await expect(filters).not.toHaveAttribute('aria-busy', 'true');
    await expect(filters.getByTestId('staff-claims-pending')).toHaveCount(0);

    const noMatch = `TEST-S7-no-staff-result-${testInfo.project.name}`;
    await input.fill(noMatch);
    await input.press('Enter');
    await expect(page).toHaveURL(url => url.searchParams.get('search') === noMatch);
    await expect(ready.getByTestId('staff-claims-row')).toHaveCount(0);
    await expect(ready.getByTestId('staff-claims-empty')).toBeVisible();
    await expect(submit).toBeEnabled();
    await expect(filters).not.toHaveAttribute('aria-busy', 'true');
    const clear = form.locator('a');
    await expect(clear).toHaveCount(1);
    await clear.click();
    await expect(page).toHaveURL(url => !url.searchParams.has('search'));
    await expect(ready.getByTestId('staff-claims-row')).toHaveCount(originalCount);
    await expect(submit).toBeEnabled();
    await expect(filters.getByTestId('staff-claims-pending')).toHaveCount(0);
  });
});
