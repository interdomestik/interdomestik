import { expect, type Locator, type Page } from '@playwright/test';
import { OPS_PAGE_SIZE, OPS_POOL_LIMIT } from '../../../src/features/admin/claims/types';

// The Ops pool is capped at OPS_POOL_LIMIT rows and served OPS_PAGE_SIZE per page
// (getOpsCenterData), so the last reachable zero-based page index is
// ceil(200 / 10) - 1 = 19, i.e. at most 19 load-more transitions from page 0.
const OPS_LAST_PAGE_INDEX = Math.ceil(OPS_POOL_LIMIT / OPS_PAGE_SIZE) - 1;

// Transitional layouts can leave a hidden duplicate of a marker in the DOM.
// Own only the active (visible) instance, and require exactly one of it so a
// second active instance still fails instead of being concealed.
export async function expectSingleActive(owner: Locator): Promise<void> {
  await expect(owner).toHaveCount(1);
  await expect(owner).toBeVisible();
}

// Zero-based Ops page index from the URL; an absent `page` param is page 0.
function opsPageIndex(url: URL): number {
  const raw = url.searchParams.get('page');
  return raw === null ? 0 : Number(raw);
}

// Ops queue URL identity: canonical path plus the exact view/lifecycle/branch filters.
function isOpsQueueUrl(url: URL, opsPath: string, branch: string): boolean {
  return (
    url.pathname === opsPath &&
    url.searchParams.get('view') === 'ops' &&
    url.searchParams.get('lifecycle') === 'intake' &&
    url.searchParams.get('branch') === branch
  );
}

// Follows the real load-more anchor of the current active Ops root, page by page,
// until the exact claim card is visible. Bounded by the canonical pool limit/page
// size; it never selects a different claim. When no load-more anchor exists or the
// last pool page is reached, it returns and the caller's count-1 assertion fails.
export async function advanceOpsToCard(
  page: Page,
  ops: Locator,
  totalOpenValue: Locator,
  card: Locator,
  opsPath: string,
  branch: string
): Promise<void> {
  for (let pageIndex = 0; pageIndex <= OPS_LAST_PAGE_INDEX; pageIndex++) {
    // Ready state for this page: URL is on the expected page, then one active root + KPI.
    await expect(page).toHaveURL(
      url => isOpsQueueUrl(url, opsPath, branch) && opsPageIndex(url) === pageIndex
    );
    await expectSingleActive(ops);
    await expect(totalOpenValue).toHaveText(/^[1-9]\d*$/);

    if ((await card.count()) > 0 || pageIndex === OPS_LAST_PAGE_INDEX) return;

    const loadMore = ops.locator('a[data-testid="load-more-button"]').filter({ visible: true });
    if ((await loadMore.count()) === 0) return;
    await expectSingleActive(loadMore);

    const href = await loadMore.getAttribute('href');
    expect(href).not.toBeNull();
    const current = new URL(page.url());
    const next = new URL(href as string, current);
    expect(next.origin).toBe(current.origin);
    expect(next.pathname).toBe(opsPath);
    expect(isOpsQueueUrl(next, opsPath, branch)).toBe(true);
    expect(next.searchParams.get('page')).toBe(String(pageIndex + 1));

    await loadMore.click();
    await expect(page).toHaveURL(
      url => isOpsQueueUrl(url, opsPath, branch) && opsPageIndex(url) === pageIndex + 1
    );
  }
}
