import { expect, test } from '@playwright/test';

// Deterministic data from seed:golden
const USERS = {
  MEMBER: { email: 'member.tracking.ks@interdomestik.com', password: 'GoldenPass123!' },
  AGENT: { email: 'agent.ks.a1@interdomestik.com', password: 'GoldenPass123!' },
};

const CLAIMS = {
  EVALUATION_ID: 'claim_track_2', // as per seed goldenId logic, might be hashed or prefixed?
  // goldenId usually just returns string if simple, check impl.
  // Usually goldenId prefixes unless 'golden_' is in input.
  // Input was 'claim_track_2', goldenId likely returns 'golden_claim_track_2' or similar.
  // We need to match what seed does.
  // Checking seed-ids.ts would be ideal, but assuming simple deterministic mapping if not shown.
  // Actually, let's verify if we can find the ID in the UI by text if ID is uncertain.
  TOKEN: 'demo-token-123',
};

test.describe('Claim Tracking', () => {
  test('Member can view their claims', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[name="email"]', USERS.MEMBER.email);
    await page.fill('input[name="password"]', USERS.MEMBER.password);
    await page.click('button[type="submit"]');

    // 2. Navigate to claim (we might need to find it in list or go direct if we know ID)
    // Finding it in list is safer if ID generation implies hash.
    // Assuming member dashboard has a link "My Claims" or similar.
    // Or we go to /sq/member/claims (if that list exists) or try deep link if we guess ID.
    // Let's try to find it in the dashboard list first if feasible, or use text search.

    // For now, let's look for text "Tracking Demo: Evaluation" on main dashboard or claims list
    await page.getByText('Tracking Demo: Evaluation').click();

    // 3. Assert Detail Page
    await expect(page.getByTestId('claim-tracking-title')).toBeVisible();
    await expect(page.getByTestId('claim-status-badge')).toContainText('Vlerësim'); // "Evaluation" in SQ
    await expect(page.getByTestId('claim-timeline')).toBeVisible();

    // 4. Share Link
    await expect(page.getByTestId('share-tracking-link')).toBeVisible();
  });

  test('Public tracking link shows status without login', async ({ page }) => {
    // 1. Visit public link
    await page.goto(`/track/${CLAIMS.TOKEN}?lang=sq`);

    // 2. Assert Public Card
    await expect(page.getByTestId('public-tracking-card')).toBeVisible();
    await expect(page.getByTestId('claim-status-badge')).toContainText('Vlerësim');

    // 3. Assert No PII
    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain('member.tracking.ks@interdomestik.com');
  });

  test('Agent can see client claims', async ({ page }) => {
    // 1. Login as Agent
    await page.goto('/login');
    await page.fill('input[name="email"]', USERS.AGENT.email);
    await page.fill('input[name="password"]', USERS.AGENT.password);
    await page.click('button[type="submit"]');

    // 2. Go to Agent Claims
    await page.goto('/sq/agent/claims');

    // 3. Assert
    await expect(page.getByTestId('agent-claims-page')).toBeVisible();
    // Should see the tracking member
    await expect(page.getByText('KS Tracking Demo')).toBeVisible();
    // Should see at least one status (e.g. Submitted or Evaluation)
    await expect(page.getByText('Tracking Demo: Submitted')).toBeVisible();
  });
});
