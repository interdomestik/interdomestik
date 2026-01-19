import { expect, test } from '../fixtures/auth.fixture';

test.describe('Security & Isolation Smoke Tests', () => {
  // Test 1: Cross-Tenant Isolation
  // Requirement: A user from Tenant A (KS) cannot access resources from Tenant B (MK).
  test('Cross-Tenant Access Denial (KS -> MK)', async ({ authenticatedPage, request }) => {
    // 1. Login as KS Member (done by fixture)
    // 2. Try to access a known MK resource ID via API (simulating direct attack)
    // We use a made-up MK ID or one we know exists from seed if deterministic.
    // Even simpler: Try to verify a claim number that belongs to MK.

    const MK_CLAIM_NUMBER = 'CLM-MK-2024-001';

    // API Check
    const response = await request.get(`/api/claims?number=${MK_CLAIM_NUMBER}`);
    // Should either be 200 with empty list (filtered) or 403/404.
    // Product rule: "You don't see what you don't own". So empty list or 404 is correct.
    // If it returns the MK claim, FAIL.

    const data = await response.json();
    if (response.ok()) {
      // If OK, data must NOT contain the MK claim
      const hasMKClaim =
        Array.isArray(data) && data.some((c: any) => c.claimNumber === MK_CLAIM_NUMBER);
      expect(hasMKClaim, 'Security Breach: KS user retrieved MK claim via API').toBe(false);
    } else {
      // 403/404 is also acceptable security
      expect([403, 404]).toContain(response.status());
    }
  });

  // Test 2: Role Isolation
  // Requirement: Agent cannot access Admin Dashboard
  test('Role Privilege Enforcement (Agent -> Admin)', async ({ agentPage }) => {
    // Agent attempts to visit Admin Dashboard
    await agentPage.goto('/en/admin');

    // Should be redirected or show Forbidden
    const url = agentPage.url();
    // Expect redirect to agent dashboard or login
    const isSafe = url.includes('/agent') || url.includes('/login') || url.includes('/error');
    expect(isSafe, `Security Breach: Agent accessed Admin URL: ${url}`).toBe(true);

    // Use strict locator check for absence of admin elements
    await expect(agentPage.locator('[data-testid="admin-sidebar"]')).not.toBeVisible();
  });

  // Test 3: Public Token Isolation
  // Requirement: Public token viewer cannot access private authenticated API
  test('Public Token Scope Containment', async ({ request }) => {
    // Use a dummy token format
    const response = await request.get('/api/claims/123-private-id', {
      headers: {
        Authorization: 'Bearer tracked_claim_token_123', // Fake token attempt
      },
    });

    // Should Fail - Public tokens don't grant API Bearer access
    expect(response.status()).not.toBe(200);
  });
});
