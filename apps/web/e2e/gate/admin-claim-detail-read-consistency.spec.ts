import { E2E_PASSWORD } from '@interdomestik/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { resolvePlaywrightNetwork } from '../../playwright-network';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { account, interactiveLogin } from './test/login-handoff-page';

// Maintained golden seeds (packages/database/src/seed-golden/claims.ts and users.ts).
const SEEDS = {
  mk: {
    id: 'golden_mk_track_claim_001',
    title: 'MK Deterministic Claim',
    claimNumber: 'CLM-MK-2026-900001',
    memberName: 'Aleksandar Stojanovski',
    memberEmail: 'member.mk.1@interdomestik.com',
    memberNumber: 'MEM-2026-000001',
    memberId: 'golden_mk_member_1',
  },
  ks: {
    id: 'golden_ks_track_claim_001',
    title: 'Aksident i lehtë – Demo Tracking',
    claimNumber: 'CLM-XK-2026-800001',
    memberName: 'KS Tracking Demo',
    memberEmail: 'member.tracking.ks@interdomestik.com',
    memberNumber: 'MEM-2026-000014',
    memberId: 'golden_ks_member_tracking',
  },
} as const;

type Seed = (typeof SEEDS)[keyof typeof SEEDS];
type TimelineState = { kind: 'empty' } | { kind: 'entries'; titles: string[] };

const IDA_HOST = 'ida.127.0.0.1.nip.io';

function seedFor(info: TestInfo): Seed {
  const name = info.project.name;
  // Mirrors account(): the project name selects the tenant's admin, so selection must be exact.
  if (name.includes('mk')) return SEEDS.mk;
  if (name.includes('ks')) return SEEDS.ks;
  throw new Error(`Unsupported gate project for admin claim detail proof: ${name}`);
}

// The known IDA front door on the actual loopback port; no IDA_HOST override and no tenant header.
function knownIdaTarget(info: TestInfo): { origin: string; locale: string } {
  const { BIND_HOST, PORT } = resolvePlaywrightNetwork();
  if (BIND_HOST !== '127.0.0.1') throw new Error('Refusing a non-loopback gate target');
  const origin = new URL(`http://${IDA_HOST}:${PORT}`);
  if (origin.hostname !== IDA_HOST || origin.protocol !== 'http:') {
    throw new Error('Refusing a target that is not the known local IDA front door');
  }
  return { origin: origin.origin, locale: routes.getLocale(info) };
}

async function loginThroughNormalUi(
  page: Page,
  origin: string,
  locale: string,
  info: TestInfo
): Promise<void> {
  const admin = account(info, true);
  await gotoApp(page, '/login', info, {
    baseURL: `${origin}/${locale}`,
    marker: 'auth-ready',
  });
  // Fresh storage has no consent choice; decline through the real control before submitting.
  const decline = page.getByTestId('cookie-consent-decline');
  await expect(decline).toBeVisible();
  await decline.click();
  await expect(page.getByTestId('cookie-consent-banner')).toHaveCount(0);
  await interactiveLogin(page, locale);
  await page.getByTestId('login-email').fill(admin.email);
  await page.getByTestId('login-password').fill(E2E_PASSWORD);
  const [response] = await Promise.all([
    page.waitForResponse(
      r =>
        new URL(r.url()).pathname === '/api/auth/sign-in/email' && r.request().method() === 'POST'
    ),
    page.getByTestId('login-submit').click(),
  ]);
  expect(response.status()).toBe(200);
  expect(response.request().headers()['x-tenant-id']).toBeUndefined();
  await expect(page).toHaveURL(url => {
    const landed = new URL(url);
    const home = `/${locale}/admin`;
    return (
      landed.origin === origin &&
      (landed.pathname === home || landed.pathname.startsWith(`${home}/`))
    );
  });

  const sessionResponse = await page.context().request.get(`${origin}/api/auth/get-session`);
  expect(sessionResponse.status()).toBe(200);
  const session = (await sessionResponse.json()) as {
    user?: { email?: string; role?: string; tenantId?: string };
  };
  expect(session.user?.email).toBe(admin.email);
  expect(session.user?.role).toBe(admin.dbRole);
  expect(session.user?.tenantId).toBe(admin.tenantId);
}

async function expectDetail(
  page: Page,
  seed: Seed,
  listed: { title: string; code: string; memberName: string }
): Promise<void> {
  await expect(page.getByTestId('not-found-page')).toHaveCount(0);
  const heading = page.getByRole('heading', { level: 1, name: listed.title, exact: true });
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveText(seed.title);
  const number = page.locator(`a[href$="/admin/claims/number/${listed.code}"]`);
  await expect(number).toHaveCount(1);
  await expect(number).toHaveText(seed.claimNumber);
  // ClaimantInfoCard: name above the email, member number below it.
  const email = page.getByText(seed.memberEmail, { exact: true });
  await expect(email).toHaveCount(1);
  await expect(email.locator('xpath=preceding-sibling::div[1]')).toHaveText(listed.memberName);
  await expect(email.locator('xpath=following-sibling::div[1]')).toHaveText(seed.memberNumber);
}

async function readTimeline(page: Page): Promise<TimelineState> {
  const section = page.locator('#timeline-section');
  const root = section.getByTestId('ops-timeline');
  // The root exists only after the streamed server section replaces its suspense fallback.
  await expect(root).toHaveCount(1);
  const items = root.getByTestId('ops-timeline-item');
  const empty = root.getByTestId('ops-timeline-empty');
  await expect(async () => {
    expect((await items.count()) + (await empty.count())).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
  if ((await items.count()) === 0) {
    await expect(empty).toHaveCount(1);
    return { kind: 'empty' };
  }
  await expect(empty).toHaveCount(0);
  const titles: string[] = [];
  for (let i = 0; i < (await items.count()); i += 1) {
    titles.push((await items.nth(i).locator('p').first().innerText()).trim());
  }
  return { kind: 'entries', titles };
}

async function expectMemberProfile(page: Page, seed: Seed, url: string): Promise<void> {
  await expect(page).toHaveURL(url);
  await expect(page.getByTestId('not-found-page')).toHaveCount(0);
  // UserProfileHeader: the member's name is the page heading, the email sits beneath it.
  const heading = page.getByRole('heading', { level: 1, name: seed.memberName, exact: true });
  await expect(heading).toHaveCount(1);
  await expect(page.getByText(seed.memberEmail, { exact: true })).toHaveCount(1);
}

test.describe('Admin claim detail read consistency', () => {
  test('known IDA front-door admin opens a listed claim, follows number links and preserves reloads', async ({
    browser,
  }, testInfo) => {
    // The generic smoke project also matches this file; only gate projects carry a tenant admin.
    test.skip(
      !testInfo.project.name.startsWith('gate-'),
      `Admin claim detail proof runs only in gate projects, not ${testInfo.project.name}`
    );
    const seed = seedFor(testInfo);
    const { origin, locale } = knownIdaTarget(testInfo);
    const context = await browser.newContext({
      extraHTTPHeaders: {},
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();
      await loginThroughNormalUi(page, origin, locale, testInfo);

      await gotoApp(page, '/admin/claims', testInfo, {
        baseURL: `${origin}/${locale}`,
        marker: 'admin-claims-v2-ready',
      });
      const ready = page.getByTestId('admin-claims-v2-ready').filter({ visible: true });
      await expect(ready).toHaveCount(1);
      // The list is paged and ordered by recency, so narrow it by the exact seed id as an admin would.
      await ready.getByTestId('claims-search-input').fill(seed.id);
      await expect(page).toHaveURL(url => new URL(url).searchParams.get('search') === seed.id);
      await expect(page.getByTestId('admin-claims-pending')).toHaveCount(0);

      const eyeSelector = `a[data-testid="view-claim"][href$="/admin/claims/${seed.id}"]`;
      const eye = ready.locator(eyeSelector);
      await expect(eye).toHaveCount(1);
      const row = ready.getByTestId('claim-operational-card').filter({
        has: page.locator(eyeSelector),
      });
      await expect(ready.getByTestId('claim-operational-card')).toHaveCount(1);
      await expect(row).toHaveCount(1);
      const identity = row.getByTestId('claim-identity');
      const listed = {
        title: (await identity.getByRole('heading', { level: 3 }).innerText()).trim(),
        code: (await identity.locator('span').first().innerText()).trim(),
        memberName: seed.memberName,
      };
      expect(listed.title).toBe(seed.title);
      expect(listed.code).toBe(seed.claimNumber);
      await expect(row.getByTestId('claim-metadata')).toContainText(seed.memberName);

      await eye.click();
      await expect(page).toHaveURL(`${origin}/${locale}/admin/claims/${seed.id}`);
      await expectDetail(page, seed, listed);
      // seed-golden inserts no stage history for this claim; whichever truthful state renders
      // (empty label or entries) is recorded here and must be identical after the reload.
      const before = await readTimeline(page);

      const reloaded = await page.reload({ waitUntil: 'domcontentloaded' });
      expect(reloaded?.status()).toBe(200);
      await expect(page).toHaveURL(`${origin}/${locale}/admin/claims/${seed.id}`);
      await expectDetail(page, seed, listed);
      expect(await readTimeline(page)).toEqual(before);

      // Header claim-number link: the tenant-scoped resolver lands on the same canonical claim.
      const resolvedClaim = `${origin}/${locale}/admin/claims/${seed.id}?ref=${encodeURIComponent(seed.claimNumber)}`;
      await page.locator(`a[href$="/admin/claims/number/${listed.code}"]`).click();
      await expect(page).toHaveURL(resolvedClaim);
      await expectDetail(page, seed, listed);
      expect(await readTimeline(page)).toEqual(before);
      const reloadedClaim = await page.reload({ waitUntil: 'domcontentloaded' });
      expect(reloadedClaim?.status()).toBe(200);
      await expect(page).toHaveURL(resolvedClaim);
      await expectDetail(page, seed, listed);

      // Header member-number link: resolves to the claimant's canonical admin profile.
      const memberLink = page.locator(`a[href$="/admin/members/number/${seed.memberNumber}"]`);
      await expect(memberLink).toHaveCount(1);
      await expect(memberLink).toHaveText(seed.memberNumber);
      await memberLink.click();
      const profile = `${origin}/${locale}/admin/users/${seed.memberId}`;
      await expectMemberProfile(page, seed, profile);
      const reloadedProfile = await page.reload({ waitUntil: 'domcontentloaded' });
      expect(reloadedProfile?.status()).toBe(200);
      await expectMemberProfile(page, seed, profile);
    } finally {
      await context.close();
    }
  });
});
