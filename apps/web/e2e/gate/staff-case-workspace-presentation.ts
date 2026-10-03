import { expect, type Page, type TestInfo } from '@playwright/test';

export type PresentationMetrics = {
  rootFontSizePx: number;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  documentOverflowPx: number;
  bodyOverflowPx: number;
  workspaceOverflowPx: number;
  workspaceWidthPx: number;
};

export type WorkspaceTextSizes = { heading: number | null; paragraph: number | null };

export type AnchorGeometry = {
  section: string;
  stickyHeaderCount: number;
  compactHeaderCount: number;
  headerBottomPx: number;
  headerHeightPx: number;
  targetTopPx: number;
  headingTopPx: number | null;
  targetGapPx: number;
  headingGapPx: number | null;
};

export function visible(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

export function navLink(page: Page, section: string) {
  return page
    .locator(`[data-testid="staff-claim-workspace-nav-link"][data-section="${section}"]`)
    .filter({ visible: true });
}

export async function workspaceRoot(page: Page) {
  const workspace = visible(page, 'staff-claim-detail-ready');
  await expect(workspace).toHaveCount(1);
  return workspace;
}

// Next can leave a stale hidden ready marker, so region order is read inside the single visible
// workspace node instead of through document-wide id lookups.
export async function regionOrder(page: Page, regions: readonly string[]): Promise<string[]> {
  const workspace = await workspaceRoot(page);
  return workspace.evaluate(
    (root, ids) => {
      const found = ids.flatMap(id => {
        const node = root.querySelector(`[id="${id}"]`);
        return node ? [{ id, node }] : [];
      });
      found.sort((a, b) =>
        a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      );
      return found.map(entry => entry.id);
    },
    [...regions]
  );
}

/** Measures document, body and visible-workspace overflow so reflow failures cannot be masked. */
export async function presentationMetrics(page: Page): Promise<PresentationMetrics> {
  const workspace = await workspaceRoot(page);
  return workspace.evaluate(node => {
    const overflow = (element: Element | null) =>
      element ? Math.round(element.scrollWidth - element.clientWidth) : -1;
    return {
      rootFontSizePx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      documentOverflowPx: overflow(document.documentElement),
      bodyOverflowPx: overflow(document.body),
      workspaceOverflowPx: overflow(node),
      workspaceWidthPx: Math.round(node.getBoundingClientRect().width),
    };
  });
}

/** Reads representative heading and paragraph text sizes inside the visible workspace. */
export async function workspaceTextSizes(page: Page): Promise<WorkspaceTextSizes> {
  const workspace = await workspaceRoot(page);
  return workspace.evaluate(node => {
    const read = (selector: string) => {
      const element = node.querySelector(selector);
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : null;
    };
    return { heading: read('h1, h2, h3'), paragraph: read('p') };
  });
}

// Activates a local CSS root font scale from the measured baseline and waits for the real
// computed value: no browser zoom and no style or security policy is involved.
export async function activateRootFontScale(
  page: Page,
  baselineRootFontPx: number
): Promise<number> {
  expect(baselineRootFontPx).toBeGreaterThan(0);
  const targetRootFontPx = baselineRootFontPx * 2;
  await page.evaluate(px => {
    document.documentElement.style.setProperty('font-size', `${px}px`, 'important');
  }, targetRootFontPx);
  const readRootFontPx = () =>
    page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  await expect.poll(readRootFontPx).toBe(targetRootFontPx);
  return targetRootFontPx;
}

export async function recordPresentation(
  page: Page,
  testInfo: TestInfo,
  label: string
): Promise<PresentationMetrics> {
  const metrics = await presentationMetrics(page);
  await testInfo.attach(`staff-case-workspace-${label}-metrics`, {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach(`staff-case-workspace-${label}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  return metrics;
}

export function expectNoHorizontalOverflow(metrics: PresentationMetrics) {
  expect(metrics.workspaceWidthPx).toBeGreaterThan(0);
  expect(metrics.workspaceOverflowPx).toBeLessThanOrEqual(1);
  expect(metrics.bodyOverflowPx).toBeLessThanOrEqual(1);
  expect(metrics.documentOverflowPx).toBeLessThanOrEqual(1);
}

/**
 * Measures the scrolled position of a section destination against the real shared header. The
 * header is located by the shipped responsive-compact marker, falling back to the single sticky
 * header actually rendered, so the comparison uses measured geometry rather than assumed heights.
 */
export async function anchorGeometry(page: Page, section: string): Promise<AnchorGeometry> {
  const workspace = await workspaceRoot(page);
  return workspace.evaluate((root, id) => {
    const headers = Array.from(document.querySelectorAll('header'));
    const sticky = headers.filter(element => getComputedStyle(element).position === 'sticky');
    const compact = headers.filter(element => element.dataset.density === 'responsive-compact');
    const header = compact[0] ?? sticky[0] ?? null;
    const headerRect = header ? header.getBoundingClientRect() : null;
    const headerBottomPx = headerRect ? Math.round(headerRect.bottom) : -1;
    const target = root.querySelector(`[id="${id}"]`);
    const heading = target ? target.querySelector('h1, h2, h3') : null;
    const targetTopPx = target ? Math.round(target.getBoundingClientRect().top) : Number.NaN;
    const headingTopPx = heading ? Math.round(heading.getBoundingClientRect().top) : null;
    return {
      section: id,
      stickyHeaderCount: sticky.length,
      compactHeaderCount: compact.length,
      headerBottomPx,
      headerHeightPx: headerRect ? Math.round(headerRect.height) : -1,
      targetTopPx,
      headingTopPx,
      targetGapPx: targetTopPx - headerBottomPx,
      headingGapPx: headingTopPx === null ? null : headingTopPx - headerBottomPx,
    };
  }, section);
}

/**
 * Keyboard-activates one section destination and proves the landed geometry: the section box and
 * its heading both stay below the sticky header bottom, which URL or visibility checks cannot see.
 */
export async function expectAnchorBelowStickyHeader(
  page: Page,
  testInfo: TestInfo,
  section: string,
  label: string
): Promise<AnchorGeometry> {
  const link = navLink(page, section);
  await expect(link).toHaveCount(1);
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#${section}$`));
  await expect(page.locator(`[id="${section}"]`).filter({ visible: true })).toHaveCount(1);

  // Waits for the real settled scroll position as a computed condition; no fixed sleep.
  await expect
    .poll(async () => (await anchorGeometry(page, section)).targetGapPx)
    .toBeGreaterThanOrEqual(0);

  const geometry = await anchorGeometry(page, section);
  await testInfo.attach(`staff-case-workspace-${label}-${section}-anchor`, {
    body: JSON.stringify(geometry, null, 2),
    contentType: 'application/json',
  });
  expect(geometry.stickyHeaderCount).toBe(1);
  expect(geometry.headerHeightPx).toBeGreaterThan(0);
  expect(geometry.targetGapPx).toBeGreaterThanOrEqual(0);
  expect(geometry.headingTopPx).not.toBeNull();
  expect(geometry.headingGapPx ?? -1).toBeGreaterThanOrEqual(0);
  return geometry;
}
