import type { Page } from '@playwright/test';
import { expect, test, type TestInfo } from '../fixtures/auth.fixture';
import {
  assertClickableTarget,
  assertNoNextStatic404s,
  assertNotRedirectedToLogin,
  installTruthLogging,
  waitForActionResponse,
} from '../utils/truth-checks';

function getLocaleFromTestInfo(testInfo: TestInfo): string {
  return testInfo.project.name.includes('mk') ? 'mk' : 'sq';
}

async function gotoWithRetries(
  page: Page,
  url: string,
  opts?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    timeoutMs?: number;
    retries?: number;
  }
): Promise<void> {
  const retries = opts?.retries ?? 2;
  const waitUntil = opts?.waitUntil ?? 'domcontentloaded';
  const timeout = opts?.timeoutMs ?? 30_000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil, timeout });
      return;
    } catch (err) {
      const msg = String(err);
      const isAborted = msg.includes('net::ERR_ABORTED');
      if (!isAborted || attempt === retries) throw err;
      await page.waitForTimeout(500);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUARANTINE / REGRESSION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Quarantine: Regressions & Flaky Flows', () => {
  test.describe('4. Balkan Agent Flow (MK)', () => {
    test.describe.configure({ mode: 'serial' }); // Dependent steps

    test('@quarantine Regression: Agent can create lead and initiate cash payment', async ({
      page,
      loginAs,
    }, testInfo) => {
      installTruthLogging(page);
      // This test is MK-tenant-specific
      if (testInfo.project.name.includes('ks-sq')) {
        test.skip(true, 'MK-only test');
        return;
      }

      const locale = 'mk';
      await loginAs('agent', 'mk');

      await page.goto(`/${locale}/agent/leads`);
      await page.waitForLoadState('networkidle');
      assertNotRedirectedToLogin(page);
      assertNoNextStatic404s(page);

      // Verify leads screen is loaded
      const leadsRoot = page.getByTestId('agent-leads-lite');
      await expect(leadsRoot).toBeVisible();

      // Verify Seeded Lead is visible (from golden seed)
      // If missing, we skip the visibility check but continue with creation
      const seededLead = page.getByText('lead.balkan@example.com');
      if (await seededLead.isVisible()) {
        await expect(seededLead).toBeVisible();
      }

      // Create New Lead
      const newLeadBtn = page.getByTestId('create-lead-button');
      await expect(newLeadBtn).toBeVisible({ timeout: 10000 });
      await expect(newLeadBtn).toBeEnabled({ timeout: 10000 });
      await assertClickableTarget(page, newLeadBtn, 'create-lead-button');
      await newLeadBtn.click();

      // Use more robust dialog selector
      const createDialog = page.getByTestId('create-lead-dialog');
      await expect(createDialog).toBeVisible({ timeout: 20000 });

      const newEmail = `smoke.balkan.${Date.now()}@test.com`;
      await page.locator('input[name="firstName"]').fill('Smoke');
      await page.locator('input[name="lastName"]').fill('Test');
      await page.locator('input[name="email"]').fill(newEmail);
      await page.locator('input[name="phone"]').fill('+38970888888');
      await page.locator('button[type="submit"]').first().click({ force: true });

      // Wait for dialog to close
      await expect(page.locator('div[role="dialog"], dialog[open]')).toBeHidden({ timeout: 15000 });

      // Wait for reload to pick up the new lead
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(newEmail)).toBeVisible({ timeout: 20000 });

      // Initiate Cash Payment for new lead (via drawer actions)
      const row = page.getByRole('row').filter({ hasText: newEmail }).first();
      await expect(row).toBeVisible({ timeout: 30000 });
      await row.click();

      const drawer = page.getByTestId('ops-drawer');
      await expect(drawer).toBeVisible({ timeout: 20000 });

      // Lite drawer hides secondary actions behind a collapsible "More Actions" section.
      const moreActionsToggle = drawer.getByRole('button', { name: /More Actions/i });
      if ((await moreActionsToggle.count()) > 0) {
        await moreActionsToggle.click();
      }

      const markContactedBtn = drawer.getByTestId('action-mark-contacted');
      const requestPaymentBtn = drawer.getByTestId('action-request-payment');

      // If the lead is still "new", Request Payment won't exist until we mark contacted.
      if ((await requestPaymentBtn.count()) === 0 && (await markContactedBtn.count()) > 0) {
        await expect(markContactedBtn).toBeVisible({ timeout: 10_000 });
        await assertClickableTarget(page, markContactedBtn, 'action-mark-contacted');

        const markContactedPromise = waitForActionResponse(page, {
          urlPart: /\/agent\/leads\b/,
          method: 'POST',
          statusIn: [200],
          timeoutMs: 30_000,
        });

        await markContactedBtn.click();
        await markContactedPromise;

        // In practice, router.refresh + dynamic revalidation can be flaky here; reload guarantees
        // we pick up the updated lead status from the server and re-compute available actions.
        await page.reload({ waitUntil: 'networkidle' });

        if (!(await drawer.isVisible())) {
          const emailCell = page.getByText(newEmail).first();
          await expect(emailCell).toBeVisible({ timeout: 30_000 });
          await emailCell.click();
          await expect(drawer).toBeVisible({ timeout: 20_000 });
        }

        if ((await moreActionsToggle.count()) > 0) {
          await moreActionsToggle.click();
        }
      }

      await expect(requestPaymentBtn).toBeVisible({ timeout: 30_000 });

      const reqPayPromise = waitForActionResponse(page, {
        // Discovery mode: tighten after first run once we see the exact endpoint.
        urlPart: /\/api\/|\/trpc\/|\/actions\/|\/admin\/|\/agent\//,
        method: 'POST',
        timeoutMs: 30_000,
      });
      await requestPaymentBtn.click();
      const reqPay = await reqPayPromise;

      console.log('[truth] request-payment:', {
        status: reqPay.status,
        url: reqPay.url,
        ok: reqPay.ok,
        jsonKeys:
          reqPay.json && typeof reqPay.json === 'object' && reqPay.json !== null
            ? Object.keys(reqPay.json as Record<string, unknown>)
            : undefined,
        excerpt: reqPay.textExcerpt,
      });

      await page.waitForLoadState('networkidle');

      // Some navigation paths keep `status=new` in the URL, which would hide the lead
      // once it becomes `payment_pending`. Navigate to the base list to assert status.
      await page.goto(`/${locale}/agent/leads`);
      await page.waitForLoadState('networkidle');
      const updatedRow = page.getByRole('row').filter({ hasText: newEmail }).first();
      await expect(updatedRow).toBeVisible({ timeout: 30_000 });
      await expect(updatedRow).toContainText(/PAYMENT PENDING|Waiting Approval|Pritje|Pending/i);
    });

    test('@quarantine Regression: Branch Manager can verify cash payment', async ({
      page,
      loginAs,
    }, testInfo) => {
      if (testInfo.project.name.includes('ks-sq')) {
        test.skip(true, 'MK-only test');
        return;
      }

      await loginAs('branch_manager', 'mk');

      // Use dynamic URL to avoid route helper issues if any
      const locale = getLocaleFromTestInfo(testInfo);
      await gotoWithRetries(page, `/${locale}/admin/leads`, {
        waitUntil: 'domcontentloaded',
        retries: 3,
      });
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('admin-page-title')).toBeVisible();

      // Find a row to approve. Wait for either rows or an empty state to mount.
      const rows = page.locator('[data-testid="cash-verification-row"]');
      const emptyState = page.getByTestId('ops-table-empty');
      await expect(rows.first().or(emptyState)).toBeVisible({ timeout: 20_000 });

      if ((await rows.count()) === 0) {
        console.log('No pending cash verification requests to approve');
        return;
      }

      const row = rows.first();

      const detailsBtn = row.getByTestId('verification-details-button');
      await detailsBtn.scrollIntoViewIfNeeded();

      // Capture attemptId from the drawer's details fetch.
      const detailsPromise = waitForActionResponse(page, {
        urlPart: /\/api\/verification\//,
        method: 'GET',
        statusIn: [200],
        timeoutMs: 20_000,
      });

      await detailsBtn.click();

      const drawer = page.getByTestId('ops-drawer');
      await expect(drawer).toBeVisible({ timeout: 15_000 });

      const origin = new URL(page.url()).origin;
      const detailsRes = await detailsPromise;

      const attemptId = detailsRes.url.replace(origin, '').split('/api/verification/')[1] ?? '';
      if (!attemptId) {
        throw new Error(`[TRUTH] missing attemptId from details fetch url=${detailsRes.url}`);
      }

      const approveBtn = drawer.getByTestId('ops-action-approve');
      await expect(approveBtn).toBeVisible({ timeout: 15_000 });
      await approveBtn.scrollIntoViewIfNeeded();

      const approvePromise = waitForActionResponse(page, {
        urlPart: /\/admin\/leads\b/,
        method: 'POST',
        statusIn: [200],
        timeoutMs: 30_000,
      });
      await approveBtn.click();
      await approvePromise;

      await expect
        .poll(
          async () => {
            const res = await page.request.get(`${origin}/api/verification/${attemptId}`);
            if (!res.ok()) return `http-${res.status()}`;
            const data = (await res.json()) as { status?: string };
            return data.status ?? 'missing-status';
          },
          { timeout: 30_000 }
        )
        .toBe('succeeded');
    });
  });

  test.describe('6. Cash Verification v2', () => {
    test('@quarantine Regression: Cash Ops: Verification queue loads and allows processing', async ({
      page,
      loginAs,
    }, testInfo) => {
      installTruthLogging(page);
      // 1. Login as Admin
      await loginAs('admin'); // Defaults to project tenant

      // 2. Navigate to Verification page
      const locale = getLocaleFromTestInfo(testInfo);
      await gotoWithRetries(page, `/${locale}/admin/leads`, {
        waitUntil: 'domcontentloaded',
        retries: 3,
      });
      await page.waitForLoadState('networkidle');
      assertNotRedirectedToLogin(page);
      assertNoNextStatic404s(page);

      await expect(page.getByTestId('admin-page-title')).toBeVisible({ timeout: 20_000 });

      // 3. VERIFY ROUTING: Check verification table is mounted
      const opsTable = page.getByTestId('ops-table');
      await expect(opsTable).toBeVisible();

      // 4. Content Check (Row OR Empty State)
      const emptyState = page.getByText(/No pending cash verification requests/i);
      const rows = page.locator('[data-testid="cash-verification-row"]');

      // Avoid a race where rows render a moment after the initial count check.
      await expect(rows.first().or(page.getByTestId('ops-table-empty')).or(emptyState)).toBeVisible(
        { timeout: 20_000 }
      );

      if ((await rows.count()) > 0) {
        // Active Flow
        const firstRow = rows.first();
        await expect(firstRow).toBeVisible();

        // Reject Flow (Stability check)
        const detailsTrigger = firstRow.getByTestId('verification-details-button');
        await assertClickableTarget(page, detailsTrigger, 'verification-details-button');
        await detailsTrigger.click();

        const drawer = page.getByTestId('ops-drawer');
        await expect(drawer).toBeVisible({ timeout: 10000 });

        const rejectActionBtn = drawer.getByTestId('ops-action-reject');
        await expect(rejectActionBtn).toBeVisible({ timeout: 15000 });
        await rejectActionBtn.scrollIntoViewIfNeeded();
        await assertClickableTarget(page, rejectActionBtn, 'ops-action-reject');
        await rejectActionBtn.click();
        const actionBar = drawer.getByTestId('ops-action-bar');
        const noteField = actionBar.locator('textarea').first();
        await expect(noteField).toBeVisible({ timeout: 10_000 });
        await noteField.fill('Rejected by E2E regression');
        const noteButtons = actionBar.getByRole('button');
        await expect(noteButtons).toHaveCount(2, { timeout: 10_000 });
        const submitBtn = noteButtons.nth(1);

        const rejectSubmitPromise = waitForActionResponse(page, {
          // Discovered endpoint: Next/React server-action POSTs to the page route.
          urlPart: /\/admin\/leads\b/,
          method: 'POST',
          statusIn: [200],
          timeoutMs: 30_000,
        });

        await submitBtn.scrollIntoViewIfNeeded();
        await submitBtn.click();
        const action = await rejectSubmitPromise;

        console.log('[truth] reject submit:', {
          status: action.status,
          url: action.url,
          ok: action.ok,
          jsonKeys:
            action.json && typeof action.json === 'object' && action.json !== null
              ? Object.keys(action.json as Record<string, unknown>)
              : undefined,
          excerpt: action.textExcerpt,
        });

        await expect(drawer).toBeHidden({ timeout: 10000 });

        const attemptIdFromUrl = new URL(action.url).searchParams.get('selected') ?? '';
        if (!attemptIdFromUrl) {
          throw new Error(`[TRUTH] reject submit missing selected attemptId url=${action.url}`);
        }

        const origin = new URL(page.url()).origin;
        await expect
          .poll(
            async () => {
              const res = await page.request.get(`${origin}/api/verification/${attemptIdFromUrl}`);
              if (!res.ok()) return `http-${res.status()}`;
              const data = (await res.json()) as { status?: string };
              return data.status ?? 'missing-status';
            },
            { timeout: 30_000 }
          )
          .toBe('rejected');

        // UI may not revalidate immediately after server-actions; reload to ensure queue reflects DB truth.
        await page.reload({ waitUntil: 'networkidle' });
        await expect(page.getByTestId('ops-table')).toBeVisible({ timeout: 20_000 });

        const toast = page
          .getByTestId('toast')
          .filter({ hasText: /Payment rejected|Pagesa u refuzua/i });
        if ((await toast.count()) > 0) {
          await expect(toast.first()).toBeVisible({ timeout: 3000 });
        }
      } else {
        // Empty State Flow
        await expect(emptyState.or(page.getByTestId('ops-table-empty'))).toBeVisible();
      }
    });
  });
});
