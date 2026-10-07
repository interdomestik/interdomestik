import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import en from '../../src/messages/en/claims.json';
import mk from '../../src/messages/mk/claims.json';
import sq from '../../src/messages/sq/claims.json';
import sr from '../../src/messages/sr/claims.json';
import { withInformationRequestFixture } from './information-request.fixture';
import {
  installInformationRequestReadSeam,
  settleFrames,
  watchPostBodies,
  type InformationRequestReadSeam,
  type ReadResultAudience,
  type ReadSeamCounts,
  type ReadSeamMode,
} from './information-request-read-result.fixture';
import { activateRootFontScale, visible } from './staff-case-workspace-presentation';

// Injected serialized read-result faults over the real Next router.refresh() transport. This is
// not a database failure: a genuinely thrown server read is covered by the page unit tests.
const PROJECT = 'gate-ks-sq';
const RETRY_NAME = 'Provo përsëri';
const DRAFT_PREFIX = 's7-read-recovery-draft';
const NAV_MARK = '__s7ReadRecoveryNativeNavigation';
const CARD_ID = 'claim-information-request';
const TEST_TIMEOUT_MS = 120_000;
const CATALOG_LABELS = Object.entries({ en, sq, mk, sr }).map(
  ([locale, messages]) => [locale, messages.claims.informationRequests.retryRead] as const
);
const LAYOUT_SCOPE = 'layout-only catalog label substitution on the rendered retry button';

type Draft = { field: Locator; value: string };
type Scenario = {
  queue: (testInfo: TestInfo) => string;
  detail: (claimId: string, testInfo: TestInfo) => string;
  ready: (page: Page) => Locator;
  messaging: (page: Page) => Locator;
};
type Context = {
  page: Page;
  audience: ReadResultAudience;
  seam: InformationRequestReadSeam;
  url: string;
  drafts: Draft[];
  recovery: Locator;
  retry: Locator;
  status: Locator;
  cards: Locator;
  failureText: string;
};

const SCENARIOS: Record<ReadResultAudience, Scenario> = {
  member: {
    queue: info => routes.memberClaims(info),
    detail: (claimId, info) => routes.memberClaimDetail(claimId, info),
    ready: page => visible(page, 'member-claim-progress-summary'),
    messaging: page => visible(page, 'messaging-panel'),
  },
  staff: {
    queue: info => routes.staffClaims(info),
    detail: (claimId, info) => routes.staffClaimDetail(claimId, info),
    ready: page => visible(page, 'staff-claim-detail-ready'),
    messaging: page => visible(page, 'staff-claim-detail-messaging'),
  },
};

async function until(
  seam: InformationRequestReadSeam,
  label: string,
  ready: (counts: ReadSeamCounts) => boolean
): Promise<void> {
  await expect
    .poll(
      () => {
        seam.assertNoError();
        return ready(seam.counts());
      },
      { message: label }
    )
    .toBe(true);
}

async function fillDrafts(page: Page, audience: ReadResultAudience): Promise<Draft[]> {
  const messaging = SCENARIOS[audience].messaging(page);
  await expect(messaging).toHaveCount(1);
  const textbox = messaging.getByRole('textbox');
  await expect(textbox).toHaveCount(1);
  const drafts: Draft[] = [{ field: textbox, value: `${DRAFT_PREFIX}-${audience}-message` }];
  if (audience === 'staff') {
    const form = visible(page, 'staff-information-request-form');
    await expect(form).toHaveCount(1);
    for (const name of ['requestedInformation', 'explanationForMember', 'dueAt']) {
      const field = form.locator(`[name="${name}"]`);
      await expect(field).toHaveCount(1);
      const dated = (await field.getAttribute('type')) === 'datetime-local';
      const due = dated ? '2031-01-15T10:00' : '2031-01-15';
      drafts.push({ field, value: name === 'dueAt' ? due : `${DRAFT_PREFIX}-${name}` });
    }
  }
  for (const draft of drafts) await draft.field.fill(draft.value);
  return drafts;
}

async function expectSiblings(ctx: Context): Promise<void> {
  await expect(SCENARIOS[ctx.audience].ready(ctx.page)).toHaveCount(1);
  await expect(ctx.cards).toHaveCount(0);
  expect(ctx.page.url()).toBe(ctx.url);
  for (const draft of ctx.drafts) await expect(draft.field).toHaveValue(draft.value);
}

async function expectRecovery(ctx: Context, state: 'failed' | 'pending'): Promise<void> {
  const busy = String(state === 'pending');
  await expect(ctx.recovery).toHaveCount(1);
  await expect(ctx.retry).toHaveAttribute('aria-busy', busy);
  await expect(ctx.retry).toHaveAttribute('aria-disabled', busy);
  if (state === 'pending') await expect(ctx.status).not.toHaveText(ctx.failureText);
  else await expect(ctx.status).toHaveText(ctx.failureText);
  await expectSiblings(ctx);
}

async function startRead(ctx: Context, mode: ReadSeamMode): Promise<void> {
  ctx.seam.arm(mode);
  await ctx.retry.focus();
  await expect(ctx.retry).toBeFocused();
  await ctx.page.keyboard.press('Enter');
}

async function openFailedDetail(
  page: Page,
  testInfo: TestInfo,
  audience: ReadResultAudience,
  detailPath: string,
  seam: InformationRequestReadSeam
): Promise<void> {
  const scenario = SCENARIOS[audience];
  await gotoApp(page, scenario.queue(testInfo), testInfo);
  await expect(page.locator('body')).toBeVisible();
  const link = page.locator(`a[href="${detailPath}"]`).filter({ visible: true });
  await expect(link).toHaveCount(1);
  await page.evaluate(key => Reflect.set(window, key, true), NAV_MARK);
  seam.arm({ kind: 'failure', initialFailure: true });
  await link.click();
  await until(seam, 'native navigation read was failed', c => c.initialNavigation === 1);
  await expect(page).toHaveURL(url => url.pathname === detailPath);
  await expect(scenario.ready(page)).toHaveCount(1);
  const sameDocument = await page.evaluate(key => Reflect.get(window, key) === true, NAV_MARK);
  expect(sameDocument).toBe(true);
  // Initial failure stays armed until the member messaging read and background GET completed.
  if (audience === 'member') {
    const messaging = scenario.messaging(page);
    const refresh = messaging.locator('button:not([data-testid="send-message-button"])');
    await expect(refresh).toHaveCount(1);
    await expect(refresh).toBeEnabled();
    await expect(messaging.getByRole('status')).toHaveText('');
    await expect(messaging.getByRole('alert')).toHaveCount(0);
    const done = (c: ReadSeamCounts) => c.backgroundInitial >= 1 && c.initialOutstanding === 0;
    await until(seam, 'member background read was failed', done);
  }
  await seam.finishInitial();
  expect(seam.counts()).toMatchObject({ initialNavigation: 1, initialOutstanding: 0, errors: 0 });
}

// Page-side: measures in the same task as an optional swap of the single label text node (React
// keeps the node identity) and restores the original data before returning.
function measureFit(node: Element, label: string | null) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let next = walker.nextNode(); next; next = walker.nextNode()) {
    if (next instanceof Text && next.data.trim() !== '') texts.push(next);
  }
  const [text] = texts;
  if (texts.length !== 1 || !text) throw new Error('S7 layout measurement expected one label');
  const original = text.data;
  if (label !== null) text.data = label;
  try {
    const { left, right, width } = node.getBoundingClientRect();
    const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const { scrollWidth, clientWidth } = node;
    return { left, right, width, scrollWidth, clientWidth, rootPx, viewport: window.innerWidth };
  } finally {
    text.data = original;
  }
}

// Doubled root text at 320px: the error, the actual button and all four catalog labels must fit.
async function expectRecoveryContained(ctx: Context, testInfo: TestInfo): Promise<void> {
  const { page } = ctx;
  const original = page.viewportSize();
  if (!original) throw new Error('Gate project must define a viewport');
  try {
    await page.setViewportSize({ width: 320, height: original.height });
    const rootPx = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const scaled = await activateRootFontScale(page, await page.evaluate(rootPx));
    const rows = [
      { name: 'error', target: ctx.status, label: null },
      { name: 'retry-actual', target: ctx.retry, label: null },
      ...CATALOG_LABELS.map(([locale, label]) => ({ name: locale, target: ctx.retry, label })),
    ];
    const table: ({ name: string } & ReturnType<typeof measureFit>)[] = [];
    for (const { name, target, label } of rows) {
      await target.scrollIntoViewIfNeeded();
      table.push({ name, ...(await target.evaluate(measureFit, label)) });
    }
    const body = JSON.stringify({ scope: LAYOUT_SCOPE, rootFontPx: scaled, rows: table });
    const artifact = `information-request-read-recovery-${ctx.audience}-fit`;
    await testInfo.attach(artifact, { body, contentType: 'application/json' });
    for (const fit of table) {
      expect(fit.rootPx, fit.name).toBe(scaled);
      expect(fit.width, fit.name).toBeGreaterThan(0);
      expect(fit.left, fit.name).toBeGreaterThanOrEqual(0);
      expect(fit.right, fit.name).toBeLessThanOrEqual(fit.viewport + 1);
      expect(fit.scrollWidth, fit.name).toBeLessThanOrEqual(fit.clientWidth + 1);
    }
  } finally {
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    await page.setViewportSize(original);
  }
}

async function runScenario(
  page: Page,
  testInfo: TestInfo,
  audience: ReadResultAudience
): Promise<void> {
  test.setTimeout(TEST_TIMEOUT_MS);
  test.skip(testInfo.project.name !== PROJECT, 'The Albanian KS fixture owns this packet');
  expect(routes.getLocale(testInfo)).toBe('sq');
  await withInformationRequestFixture(async ({ claimId }) => {
    const pathname = SCENARIOS[audience].detail(claimId, testInfo);
    const seam = await installInformationRequestReadSeam(page, { audience, claimId, pathname });
    const draftPosts = watchPostBodies(page, DRAFT_PREFIX);
    try {
      await openFailedDetail(page, testInfo, audience, pathname, seam);
      const recovery = visible(page, 'information-request-read-recovery');
      const parts = {
        recovery,
        retry: recovery.getByRole('button', { name: RETRY_NAME }),
        status: recovery.getByRole('status'),
      };
      for (const locator of Object.values(parts)) await expect(locator).toHaveCount(1);
      const failureText = (await parts.status.innerText()).trim();
      expect(failureText).not.toBe('');
      const drafts = await fillDrafts(page, audience);
      const ctx: Context = {
        ...parts,
        page,
        audience,
        seam,
        url: page.url(),
        drafts,
        failureText,
        cards: visible(page, CARD_ID),
      };
      await expectRecovery(ctx, 'failed');
      await expectRecoveryContained(ctx, testInfo);
      const before = seam.counts();
      await startRead(ctx, { kind: 'failure', hold: true });
      await until(seam, 'held failed read reached the server', c => c.awaitingRelease);
      await expectRecovery(ctx, 'pending');
      await page.keyboard.press('Enter');
      await settleFrames(page);
      expect(seam.counts().eligible).toBe(before.eligible + 1);
      await expectRecovery(ctx, 'pending');
      seam.release();
      await until(seam, 'held failure was delivered', c => c.deliberateFailed === 1);
      await expectRecovery(ctx, 'failed');
      await startRead(ctx, { kind: 'passthrough', hold: true, verifyEmpty: true });
      await until(seam, 'held successful read reached the server', c => c.awaitingRelease);
      await expectRecovery(ctx, 'pending');
      seam.release();
      await until(seam, 'successful read was delivered', c => c.deliberatePassed === 1);
      await expect(recovery).toHaveCount(0);
      await expectSiblings(ctx);
      seam.assertNoError();
      const done = seam.counts();
      expect(done).toMatchObject({ deliberateFailed: 1, deliberatePassed: 1, unarmed: 0 });
      expect(done).toMatchObject({ initialNavigation: 1, errors: 0, awaitingRelease: false });
      expect(draftPosts()).toBe(0);
      await testInfo.attach(`information-request-read-recovery-${audience}-counts`, {
        body: JSON.stringify(done),
        contentType: 'application/json',
      });
    } finally {
      await seam.restore();
    }
  });
}

test.describe('S7 information request read recovery', () => {
  test('member retries a failed read and keeps drafts', async ({ authenticatedPage }, testInfo) => {
    await runScenario(authenticatedPage, testInfo, 'member');
  });

  test('staff retries a failed read and keeps drafts', async ({ staffPage }, testInfo) => {
    await runScenario(staffPage, testInfo, 'staff');
  });
});
