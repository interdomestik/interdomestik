import type { Response } from '@playwright/test';
import { E2E_USERS } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

type GateSeed = {
  ops: { branch: string; claimId: string; title: string };
  member: { id: string; name: string; email: string };
  lead: { attemptId: string; email: string };
};

// Maintained golden seed fields (packages/database/src/seed-golden/*).
const GATE_SEEDS: Record<string, GateSeed> = {
  'gate-ks-sq': {
    ops: {
      branch: 'KS-A',
      claimId: 'golden_ks_a_claim_01',
      title: 'KS-A SUBMITTED Claim 1',
    },
    member: {
      id: 'golden_ks_a_member_1',
      name: 'KS A-Member 1',
      email: 'member.ks.a1@interdomestik.com',
    },
    lead: {
      attemptId: 'golden_attempt_ks_a_cash_lead_1',
      email: 'ks_a_cash_lead_1@example.com',
    },
  },
  'gate-mk-mk': {
    ops: {
      branch: 'MK-A',
      claimId: 'golden_claim_mk_1',
      title: 'Rear ended in Skopje (Baseline)',
    },
    member: {
      id: 'golden_mk_member_1',
      name: E2E_USERS.MK_MEMBER.name,
      email: E2E_USERS.MK_MEMBER.email,
    },
    lead: {
      attemptId: 'golden_pay_attempt_balkan',
      email: 'lead.balkan@example.com',
    },
  },
};

function gateSeed(projectName: string): GateSeed {
  const seed = GATE_SEEDS[projectName];
  test.skip(!seed, `tenant reader context is only maintained for ${Object.keys(GATE_SEEDS)}`);
  return seed;
}

test.describe('Tenant reader context (mounted caller continuity)', () => {
  test('admin Ops center card opens the exact scoped claim and survives reload', async ({
    page,
    loginAs,
  }, testInfo) => {
    const seed = gateSeed(testInfo.project.name);
    const locale = routes.getLocale(testInfo);
    const { branch, claimId, title } = seed.ops;
    const claimPath = `/${locale}/admin/claims/${claimId}`;

    await loginAs('admin');
    await gotoApp(
      page,
      `${routes.adminClaims(testInfo)}?view=ops&lifecycle=intake&branch=${branch}`,
      testInfo,
      { marker: 'ops-center-page' }
    );

    await expect(page.getByTestId('ops-center-page')).toBeVisible();
    await expect(page.getByTestId('error-boundary')).toHaveCount(0);

    // Real KPI: total open is numeric and positive (first span is the value).
    const totalOpenValue = page.getByTestId('kpi-total-open').locator('span').first();
    await expect(totalOpenValue).toHaveText(/^[1-9]\d*$/);

    const card = page.locator(`a[data-testid="claim-operational-card"][href="${claimPath}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();
    await card.click();

    const heading = page.getByRole('heading', { level: 1, name: title, exact: true });
    await expect(page).toHaveURL(url => url.pathname === claimPath);
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(url => url.pathname === claimPath);
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();
    await expect(page.getByTestId('not-found-page')).toHaveCount(0);
    await expect(page.getByTestId('error-boundary')).toHaveCount(0);
  });

  test('agent members and clients search resolve the exact assigned member and survive reload', async ({
    page,
    loginAs,
  }, testInfo) => {
    const { member } = gateSeed(testInfo.project.name);

    await loginAs('agent');

    // /agent/members: start unfiltered, then drive the real search input.
    await gotoApp(page, routes.agentMembers(testInfo), testInfo);
    const ready = page.getByTestId('agent-members-ready');
    const membersInput = page.getByTestId('agent-members-search-input');
    await expect(ready).toBeVisible();
    await expect(page).toHaveURL(url => url.searchParams.get('q') === null);
    await expect(membersInput).toBeEnabled();

    await membersInput.fill(member.name);
    await expect(page).toHaveURL(url => url.searchParams.get('q') === member.name);
    await expect(ready).toBeVisible();
    await expect(membersInput).toBeEnabled();
    await expect(membersInput).toHaveValue(member.name);
    await expect(page.getByTestId('agent-members-no-results')).toHaveCount(0);
    await expect(page.getByTestId('agent-members-list')).toBeVisible();

    // Each row renders two href-identical anchors; scope to the member-name link.
    const memberLink = ready.locator(
      `a[data-testid="agent-member-link"][href$="/agent/members/${member.id}"]`
    );
    await expect(memberLink).toHaveCount(1);
    await expect(memberLink).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(url => url.searchParams.get('q') === member.name);
    await expect(ready).toBeVisible();
    await expect(membersInput).toBeEnabled();
    await expect(membersInput).toHaveValue(member.name);
    await expect(memberLink).toHaveCount(1);
    await expect(memberLink).toBeVisible();

    // /agent/clients: real search input, email query, settled busy state.
    await gotoApp(page, routes.agentClients(testInfo), testInfo);
    const input = page.getByTestId('agent-clients-search-input');
    const region = page.getByTestId('agent-clients-search-region');
    await expect(input).toBeEnabled();
    await input.fill(member.email);

    await expect(page).toHaveURL(url => url.searchParams.get('search') === member.email);
    await expect(region).toHaveAttribute('aria-busy', 'false');
    await expect(input).toBeEnabled();

    const clientLink = page.locator(`a[href$="/agent/clients/${member.id}"]`);
    await expect(clientLink).toHaveCount(1);
    await expect(clientLink).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(url => url.searchParams.get('search') === member.email);
    await expect(region).toHaveAttribute('aria-busy', 'false');
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue(member.email);
    await expect(clientLink).toHaveCount(1);
    await expect(clientLink).toBeVisible();
  });

  test('admin verification list opens the exact cash attempt drawer from the real read API', async ({
    page,
    loginAs,
  }, testInfo) => {
    const { lead } = gateSeed(testInfo.project.name);
    const apiPath = `/api/verification/${lead.attemptId}`;
    const isDetailsGet = (response: Response) =>
      response.request().method() === 'GET' && new URL(response.url()).pathname === apiPath;

    const expectDetailsResponse = async (response: Response) => {
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { id?: string };
      expect(body.id).toBe(lead.attemptId);
    };

    const drawer = page.getByTestId('ops-drawer');
    const expectDrawerTerminal = async () => {
      await expect(drawer).toBeVisible();
      // Summary: the unique seeded email (strict locator fails if not unique).
      await expect(drawer.getByText(lead.email, { exact: true })).toBeVisible();
      await expect(drawer.getByTestId('ops-documents-panel')).toBeVisible();
      await expect(drawer.getByTestId('ops-timeline')).toBeVisible();
      await expect
        .poll(async () => {
          const documents = await drawer.getByTestId('ops-documents-empty').count();
          const documentRows = await drawer.getByTestId('ops-document-row').count();
          const timeline =
            (await drawer.getByTestId('ops-timeline-item').count()) +
            (await drawer.getByTestId('ops-timeline-empty').count());
          return (documents > 0 || documentRows > 0) && timeline > 0;
        })
        .toBe(true);
    };

    await loginAs('admin');
    await gotoApp(page, routes.adminLeads(testInfo), testInfo, {
      marker: 'verification-ops-page',
    });

    const search = page.getByTestId('verification-search-input');
    await expect(search).toBeEnabled();
    await search.fill(lead.email);
    await expect(page).toHaveURL(url => url.searchParams.get('query') === lead.email);
    await expect(page.getByTestId('verification-search-pending')).toHaveCount(0);
    await expect(search).toBeEnabled();

    const row = page
      .getByTestId('cash-verification-row')
      .filter({ has: page.getByText(lead.email, { exact: true }) });
    await expect(row).toHaveCount(1);

    // Row click is the supported details contract (VerificationTableV2 onClick).
    const [openResponse] = await Promise.all([
      page.waitForResponse(isDetailsGet),
      row.getByText(lead.email, { exact: true }).click(),
    ]);
    await expectDetailsResponse(openResponse);
    await expect(page).toHaveURL(url => url.searchParams.get('selected') === lead.attemptId);
    await expect(page).toHaveURL(url => url.searchParams.get('query') === lead.email);
    await expectDrawerTerminal();

    const [reloadResponse] = await Promise.all([page.waitForResponse(isDetailsGet), page.reload()]);
    await expectDetailsResponse(reloadResponse);
    await expect(page).toHaveURL(url => url.searchParams.get('selected') === lead.attemptId);
    await expect(page).toHaveURL(url => url.searchParams.get('query') === lead.email);
    await expectDrawerTerminal();

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    // Only `selected` is deleted; the search query is preserved.
    await expect(page).toHaveURL(url => url.searchParams.get('selected') === null);
    await expect(page).toHaveURL(url => url.searchParams.get('query') === lead.email);
  });
});
