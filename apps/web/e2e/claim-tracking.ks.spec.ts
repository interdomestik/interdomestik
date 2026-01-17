import { expect, test } from '@playwright/test';

// Deterministic data from seed:golden (KS Pack)
const DEFAULT_LOCALE = 'sq';
const TOKENS = {
  PUBLIC_DEMO: 'demo-ks-track-token-001',
};

const USERS = {
  MEMBER: { email: 'member.tracking.ks@interdomestik.com', password: 'GoldenPass123!' },
  AGENT: { email: 'agent.ks.a1@interdomestik.com', password: 'GoldenPass123!' },
};

// IDs from seed - note that goldenId() prefixes with 'golden_' typically if not already present
// But if we passed 'ks_track_claim_001' to goldenId in seed, it returns 'golden_ks_track_claim_001'.
const CLAIM_IDS = {
  TRACKING_1: 'golden_ks_track_claim_001',
};

async function loginAs(
  page: import('@playwright/test').Page,
  user: { email: string; password: string }
) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const loginURL = `${baseURL}/api/auth/sign-in/email`;

  const res = await page.request.post(loginURL, {
    data: { email: user.email, password: user.password },
    headers: {
      Origin: baseURL,
      Referer: `${baseURL}/login`,
    },
  });

  if (!res.ok()) {
    throw new Error(`API login failed for ${user.email}: ${res.status()} ${await res.text()}`);
  }

  let targetPath = '/sq/member';
  if (user.email.includes('agent')) targetPath = '/sq/agent';

  await page.goto(`${baseURL}${targetPath}`);
  await page.waitForLoadState('domcontentloaded');
}

test.describe('Claim Tracking KS ', () => {
  test('Member can view their claims', async ({ page }) => {
    // 1. Login
    await loginAs(page, USERS.MEMBER);

    // 2. Navigate to claim directly using the known seeded ID
    await page.goto(`/${DEFAULT_LOCALE}/member/claims/${CLAIM_IDS.TRACKING_1}`);

    // 3. Assert Detail Page
    await expect(page.getByTestId('claim-status-badge')).toBeVisible();
    await expect(page.getByText('Aksident i lehtë – Demo Tracking')).toBeVisible();
    await expect(page.getByTestId('claim-timeline')).toBeVisible();

    // 4. Share Link
    await expect(page.getByTestId('share-tracking-link')).toBeVisible();
  });

  test('Public tracking link shows status without login', async ({ page }) => {
    // 1. Visit public link
    await page.goto(`/track/${TOKENS.PUBLIC_DEMO}?lang=sq`);

    // 2. Assert Public Card
    await expect(page.getByTestId('public-tracking-card')).toBeVisible();

    // 3. Assert Status is "Vlerësim" (Evaluation) because ks_track_claim_001 is Evaluation
    // But wait, the token is linked to ONE specific claim.
    // In seed we linked it to ks_track_claim_001 (Evaluation).
    // Wait, in my seed code I linked it to ks_track_claim_001 properly.
    // Check status text for 'evaluation' in SQ -> 'Vlerësim'
    const statusBadge = page.getByTestId('claim-status-badge').first();
    await statusBadge.scrollIntoViewIfNeeded();
    await expect(statusBadge).toContainText('Vlerësim', { timeout: 15000 });

    // 4. Assert No PII
    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain('member.tracking.ks@interdomestik.com');
  });

  test('Agent can see client claims', async ({ page }) => {
    // 1. Login as Agent
    await loginAs(page, USERS.AGENT);

    // 2. Go to Agent Claims
    await page.goto(`/${DEFAULT_LOCALE}/agent/claims`);

    // 3. Assert
    await expect(page.getByTestId('agent-claims-page')).toBeVisible();
    await expect(page.getByTestId('agent-claims-empty')).toHaveCount(0);
    await expect(page.getByTestId('agent-claim-row').first()).toBeVisible();
  });
});
