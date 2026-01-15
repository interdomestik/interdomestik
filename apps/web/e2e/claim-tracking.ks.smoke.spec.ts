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
  await page.goto(`/${DEFAULT_LOCALE}/login?tenantId=tenant_ks`);
  await page.getByTestId('login-form').waitFor({ state: 'visible' });
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/(sq|en|sr|mk)\/(member|agent)(\/|$)/);
}

test.describe('Claim Tracking KS', () => {
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
    // Or just check that some status text is present.
    await expect(page.getByText('Vlerësim')).toBeVisible();

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
