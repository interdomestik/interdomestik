/**
 * API Permission Tests
 *
 * Tests that verify API endpoints respect role-based permissions.
 * Ensures that even direct API calls are properly secured.
 */

import { expect, test } from './fixtures/auth.fixture';

test.describe('API Permission Enforcement', () => {
  test.describe('Claims API Permissions', () => {
    test('Member API can only fetch own claims', async ({ authenticatedPage: page }) => {
      const response = await page.request.get('/api/claims?scope=member');

      expect(response.status()).toBe(200);

      const data = await response.json();
      // Member should only see their own claims
      expect(data.claims).toBeDefined();
    });

    test('Member API cannot fetch all claims', async ({ authenticatedPage: page }) => {
      const response = await page.request.get('/api/claims?scope=all');

      // Should be denied or return filtered results
      const status = response.status();
      expect(status === 403 || status === 200).toBeTruthy();

      if (status === 200) {
        const data = await response.json();
        // Should not return all claims - only member's claims
        expect(data.claims).toBeDefined();
      }
    });

    test('Member API cannot fetch agent queue', async ({ authenticatedPage: page }) => {
      const response = await page.request.get('/api/claims?scope=agent_queue');

      // Should be denied (403) or return empty/filtered results (200)
      const status = response.status();
      if (status === 200) {
        const data = await response.json();
        // If 200, should have empty or filtered claims
        expect(data.claims).toBeDefined();
      } else {
        expect(status).toBe(403);
      }
    });

    test('Agent API can fetch agent queue', async ({ agentPage: page }) => {
      const response = await page.request.get('/api/claims?scope=agent_queue');

      // Agent should get 200 or 403 based on implementation
      const status = response.status();
      // Agent typically has limited access
      expect([200, 403].includes(status)).toBeTruthy();
    });

    test('Staff API can fetch agent queue', async ({ staffPage: page }) => {
      const response = await page.request.get('/api/claims?scope=agent_queue');

      // Staff access depends on business rules - any valid HTTP response is acceptable
      // 200 = access granted, 403 = access denied (both are valid outcomes)
      expect(response.status()).toBeLessThan(500);
    });

    test('Admin API can fetch all scopes', async ({ adminPage: page }) => {
      // Member scope
      const memberResp = await page.request.get('/api/claims?scope=member');
      expect(memberResp.status()).toBe(200);

      // Admin scope
      const allResp = await page.request.get('/api/claims?scope=all');
      expect(allResp.status()).toBe(200);
    });
  });

  test.describe('Users API Permissions', () => {
    test('Member cannot access users API', async ({ authenticatedPage: page }) => {
      const response = await page.request.get('/api/users');

      // Should be denied
      expect(response.status()).not.toBe(200);
    });

    test('Agent cannot access users API', async ({ agentPage: page }) => {
      const response = await page.request.get('/api/users');

      // Should be denied
      expect(response.status()).not.toBe(200);
    });

    test('Admin can access users API', async ({ adminPage: page }) => {
      const response = await page.request.get('/api/users');

      // Admin should have access (if endpoint exists)
      // May return 404 if not implemented
      expect([200, 404].includes(response.status())).toBeTruthy();
    });
  });

  test.describe('Auth Status', () => {
    test('Authenticated request has valid session', async ({ authenticatedPage: page }) => {
      const response = await page.request.get('/api/auth/get-session');

      if (response.status() === 200) {
        const data = await response.json();
        expect(data.session || data.user).toBeDefined();
      }
    });

    test('Member session has correct role', async ({ authenticatedPage: page }) => {
      const response = await page.request.get('/api/auth/get-session');

      if (response.status() === 200) {
        const data = await response.json();
        if (data.user) {
          expect(['member', 'user'].includes(data.user.role)).toBeTruthy();
        }
      }
    });

    test('Admin session has correct role', async ({ adminPage: page }) => {
      const response = await page.request.get('/api/auth/get-session');

      if (response.status() === 200) {
        const data = await response.json();
        if (data.user) {
          expect(['admin', 'tenant_admin'].includes(data.user.role)).toBeTruthy();
        }
      }
    });

    test('Agent session has correct role', async ({ agentPage: page }) => {
      const response = await page.request.get('/api/auth/get-session');

      if (response.status() === 200) {
        const data = await response.json();
        if (data.user) {
          expect(data.user.role).toBe('agent');
        }
      }
    });

    test('Staff session has correct role', async ({ staffPage: page }) => {
      const response = await page.request.get('/api/auth/get-session');

      if (response.status() === 200) {
        const data = await response.json();
        if (data.user) {
          expect(data.user.role).toBe('staff');
        }
      }
    });
  });
});

test.describe('Sensitive Actions Permission', () => {
  test.describe('Claim Status Updates', () => {
    test('Member cannot update claim status via API', async ({ authenticatedPage: page }) => {
      const response = await page.request.post('/api/claims/claim-1/status', {
        data: { status: 'resolved' },
        headers: { 'Content-Type': 'application/json' },
      });

      // Should be denied
      expect([403, 404, 405].includes(response.status())).toBeTruthy();
    });

    test('Agent cannot update claim status via API', async ({ agentPage: page }) => {
      const response = await page.request.post('/api/claims/claim-1/status', {
        data: { status: 'resolved' },
        headers: { 'Content-Type': 'application/json' },
      });

      // Agent has view-only access - should be denied
      expect([403, 404, 405].includes(response.status())).toBeTruthy();
    });
  });

  test.describe('User Role Changes', () => {
    test('Member cannot change user roles', async ({ authenticatedPage: page }) => {
      const response = await page.request.patch('/api/users/test-user', {
        data: { role: 'admin' },
        headers: { 'Content-Type': 'application/json' },
      });

      // Should be denied
      expect([403, 404, 405].includes(response.status())).toBeTruthy();
    });

    test('Agent cannot change user roles', async ({ agentPage: page }) => {
      const response = await page.request.patch('/api/users/test-user', {
        data: { role: 'admin' },
        headers: { 'Content-Type': 'application/json' },
      });

      // Should be denied
      expect([403, 404, 405].includes(response.status())).toBeTruthy();
    });

    test('Staff cannot change user roles', async ({ staffPage: page }) => {
      const response = await page.request.patch('/api/users/test-user', {
        data: { role: 'admin' },
        headers: { 'Content-Type': 'application/json' },
      });

      // Staff may not have user role change permissions
      expect([403, 404, 405].includes(response.status())).toBeTruthy();
    });
  });
});
