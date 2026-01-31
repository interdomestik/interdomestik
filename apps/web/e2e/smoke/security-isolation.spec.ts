import { expect, test } from '../fixtures/auth.fixture';

test.describe('Security & Isolation Smoke Tests', () => {
  // Test 1: Cross-Tenant Isolation
  // Requirement: A user from Tenant A (KS) cannot access resources from Tenant B (MK).
  test('Cross-Tenant Access Denial (KS -> MK)', async ({
    authenticatedPage: _authenticatedPage,
    request,
  }) => {
    // 1. Login as KS Member (done by fixture)
    // 2. Try to access a known MK resource ID via API (simulating direct attack)
    // Product rule: "You don't see what you don't own".

    const MK_CLAIM_NUMBER = 'CLM-MK-2024-001';

    // API Check - Try to search for an MK claim as a KS user
    const response = await request.get(`/api/claims?number=${MK_CLAIM_NUMBER}`);
    const status = response.status();
    const data = await response.json().catch(() => ({}));

    // SECURITY ASSERTION: The MK claim must NEVER be visible to a KS user.
    // Valid responses:
    // - 200 with empty/filtered list (claim is not visible) - PREFERRED
    // - 401/403/404/500 - any error is also valid isolation
    // INVALID: 200 with the MK claim in the response

    if (status === 200) {
      // If 200, verify the response does NOT contain the MK claim
      const list = data.claims || data.data || [];
      const hasMKClaim =
        Array.isArray(list) &&
        list.some((c: { claimNumber?: string }) => c.claimNumber === MK_CLAIM_NUMBER);

      expect(hasMKClaim, `Security Breach: KS user retrieved MK claim ${MK_CLAIM_NUMBER}`).toBe(
        false
      );
      // 200 with empty/filtered results is VALID security behavior (tenant isolation works)
    } else {
      // Any non-200 response is valid - the key is the user cannot see MK data
      // This handles 401 (unauthenticated), 403 (forbidden), 404 (not found), 500 (error)
      expect(status, `Unexpected success status ${status}`).not.toBe(200);
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

    // Hardening: If outcome is unknown, check if we hit the Next.js internal fallback 404
    // (which doesn't have our data-testid but IS a valid security denial)
    if (outcome === 'unknown') {
      const html = await agentPage.content();
      const isNextFallback =
        html.includes('NEXT_HTTP_ERROR_FALLBACK;404') ||
        html.includes('This page could not be found');
      if (isNextFallback) {
        // This is a valid 404 isolation.
        return;
      }
    }

    expect(outcome, 'Expected redirect or 404, but admin UI was reachable.').not.toBe('admin');
    expect(outcome, 'Expected redirect or 404, but no stable state was detected.').not.toBe(
      'unknown'
    );

    if (outcome === 'redirect') {
      const finalUrl = agentPage.url();
      expect(finalUrl).not.toContain('/admin');
    } else {
      const isCustomNotFound = await notFound.isVisible();
      if (isCustomNotFound) {
        await expect(notFound).toBeVisible();
      } else {
        const html = await agentPage.content();
        const isNextFallback = html.includes('NEXT_HTTP_ERROR_FALLBACK;404');
        expect(isNextFallback, 'Expected Custom 404 or Next.js Fallback 404').toBeTruthy();
      }

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
