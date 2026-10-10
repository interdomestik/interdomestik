import { expect, test, type Locator, type Page } from '@playwright/test';

type ProfileGeometrySeed = Readonly<{
  id: string;
  memberName: string;
}>;

type ElementRect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

type ProfileGeometry = ReturnType<typeof profileGeometry>;

async function elementRect(locator: Locator): Promise<ElementRect> {
  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
  });
}

function expectWithinViewport(rect: ElementRect, width: number): void {
  expect(rect.left).toBeGreaterThanOrEqual(-1);
  expect(rect.right).toBeLessThanOrEqual(width + 1);
}

function profileGeometry(page: Page, memberName: string) {
  const heading = page.getByRole('heading', { level: 1, name: memberName, exact: true });
  const recentClaimsCard = page.locator(
    'xpath=//div[./div/h3 and parent::div[count(div)=2] and .//*[@data-testid="ops-table"]]'
  );
  const opsTable = recentClaimsCard.getByTestId('ops-table');
  const lowerGrid = recentClaimsCard.locator('xpath=parent::div');
  const claimsStatsCard = recentClaimsCard.locator('xpath=preceding-sibling::div[1]');

  return {
    heading,
    opsTable,
    recentClaimsCard,
    lowerGrid,
    claimsStatsCard,
    claimsStatsTitle: claimsStatsCard.getByRole('heading').first(),
    recentClaimsTitle: recentClaimsCard.getByRole('heading').first(),
  };
}

async function expectResponsiveProfileShell(
  page: Page,
  geometry: ProfileGeometry,
  expectMobileContent?: (viewportWidth: number) => Promise<void>
): Promise<void> {
  const {
    heading,
    opsTable,
    recentClaimsCard,
    lowerGrid,
    claimsStatsCard,
    claimsStatsTitle,
    recentClaimsTitle,
  } = geometry;

  await expect(recentClaimsCard).toHaveCount(1);
  await expect(lowerGrid).toHaveCount(1);
  await expect(claimsStatsCard).toHaveCount(1);
  await expect(opsTable).toHaveCount(1);

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ]) {
    await test.step(`profile is viewport-contained at ${viewport.width}px`, async () => {
      await page.setViewportSize(viewport);
      await expect(heading).toBeVisible();
      await expect(claimsStatsTitle).toBeVisible();
      await expect(recentClaimsTitle).toBeVisible();

      const documentWidth = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth + 1);

      for (const panel of [lowerGrid, claimsStatsCard, recentClaimsCard, opsTable]) {
        expectWithinViewport(await elementRect(panel), viewport.width);
      }

      await expectMobileContent?.(viewport.width);
    });
  }

  await test.step('profile preserves the desktop two-card row', async () => {
    const viewport = { width: 1280, height: 900 };
    await page.setViewportSize(viewport);
    const documentWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth + 1);

    const statsRect = await elementRect(claimsStatsCard);
    const recentRect = await elementRect(recentClaimsCard);
    expectWithinViewport(statsRect, viewport.width);
    expectWithinViewport(recentRect, viewport.width);
    expect(Math.abs(statsRect.top - recentRect.top)).toBeLessThanOrEqual(1);
    expect(statsRect.right).toBeLessThanOrEqual(recentRect.left + 1);
  });
}

export async function expectMemberProfileResponsiveGeometry(
  page: Page,
  seed: ProfileGeometrySeed
): Promise<void> {
  const geometry = profileGeometry(page, seed.memberName);
  const { opsTable } = geometry;
  const tableScroller = opsTable.locator('table').locator('..');
  const action = opsTable.locator(`a[href*="/admin/claims/${seed.id}"]`);

  await expect(opsTable.getByTestId('ops-table-row')).not.toHaveCount(0);
  await expect(action).toHaveCount(1);
  await expect(action).toHaveAttribute('href', new RegExp(`/admin/claims/${seed.id}(?:\\?.*)?$`));

  await expectResponsiveProfileShell(page, geometry, async viewportWidth => {
    await tableScroller.evaluate(element => {
      element.scrollLeft = 0;
    });
    await expect
      .poll(async () =>
        tableScroller.evaluate(element => element.scrollWidth > element.clientWidth + 1)
      )
      .toBe(true);

    await tableScroller.evaluate(element => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect
      .poll(async () => tableScroller.evaluate(element => element.scrollLeft))
      .toBeGreaterThan(0);

    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeVisible();
    await expect
      .poll(async () => {
        const actionRect = await elementRect(action);
        const scrollerRect = await elementRect(tableScroller);
        const unobstructed = await action.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
          return hit === element || (hit !== null && element.contains(hit));
        });

        return (
          actionRect.left >= -1 &&
          actionRect.right <= viewportWidth + 1 &&
          actionRect.left >= scrollerRect.left - 1 &&
          actionRect.right <= scrollerRect.right + 1 &&
          actionRect.top >= scrollerRect.top - 1 &&
          actionRect.bottom <= scrollerRect.bottom + 1 &&
          unobstructed
        );
      })
      .toBe(true);
  });
}

export async function expectEmptyMemberProfileResponsiveGeometry(
  page: Page,
  memberName: string
): Promise<void> {
  const geometry = profileGeometry(page, memberName);
  const { opsTable } = geometry;

  await expect(opsTable.getByTestId('ops-table-row')).toHaveCount(0);
  await expect(opsTable.getByTestId('ops-table-empty')).toHaveCount(1);
  await expect(opsTable.getByTestId('ops-table-empty')).toBeVisible();
  await expect(opsTable.locator('a[href*="/admin/claims/"]')).toHaveCount(0);

  await expectResponsiveProfileShell(page, geometry);
}
