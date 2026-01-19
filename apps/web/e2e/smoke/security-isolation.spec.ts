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

    const data = await response.json().catch(() => ({})); // Handle non-JSON 404 response

    if (response.ok()) {
      // If OK, we must verify we didn't receive the sensitive object
      const list = data.claims || [];
      const hasMKClaim =
        Array.isArray(list) && list.some((c: any) => c.claimNumber === MK_CLAIM_NUMBER);

      expect(hasMKClaim, `Security Breach: KS user retrieved MK claim ${MK_CLAIM_NUMBER}`).toBe(
        false
      );
    } else {
      // Strict Policy: 404 to prevent enumeration
      expect(response.status(), `Cross-tenant access should be 404, got ${response.status()}`).toBe(
        404
      );
    }
  });

  // Test 2: Role Isolation
  // Requirement: Agent cannot access Admin Dashboard
  test('Role Privilege Enforcement (Agent -> Admin)', async ({ agentPage }) => {
    // Agent attempts to visit Admin Dashboard
    const response = await agentPage.goto('/en/admin');
    await agentPage.waitForLoadState('domcontentloaded');

    const adminSidebar = agentPage.locator('[data-testid="admin-sidebar"]');
    const notFound = agentPage.locator('[data-testid="not-found-page"]');

    const outcome = await Promise.any([
      agentPage
        .waitForURL(/\/(agent|login)(\/|$)/, { timeout: 8_000, waitUntil: 'domcontentloaded' })
        .then(() => 'redirect'),
      notFound.waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'not-found'),
      adminSidebar.waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'admin'),
    ]).catch(() => 'unknown');

    expect(outcome, 'Expected redirect or 404, but admin UI was reachable.').not.toBe('admin');
    expect(outcome, 'Expected redirect or 404, but no stable state was detected.').not.toBe(
      'unknown'
    );

    if (outcome === 'redirect') {
      const finalUrl = agentPage.url();
      expect(finalUrl).not.toContain('/admin');
    } else {
      await expect(notFound).toBeVisible();
      await expect(adminSidebar).not.toBeVisible();
      if (response) {
        expect(
          response.status(),
          `Expected 404 on forbidden admin access, got ${response.status()}`
        ).toBe(404);
      }
    }
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
