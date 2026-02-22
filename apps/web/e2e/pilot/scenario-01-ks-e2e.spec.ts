import { E2E_USERS, claims, db, eq } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

function claimIdFromMemberSuccessPath(href: string): string {
  const trimmed = href.trim().split('?')[0];
  const parts = trimmed.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

function normalizeClaimId(raw: string): string {
  const value = raw.trim();
  if (!value || value.toLowerCase() === 'new') return '';
  return value;
}

test.describe.configure({ mode: 'serial' });

test('Scenario S1 KS Chain', async ({
  authenticatedPage: memberPage,
  agentPage,
  staffPage,
  adminPage,
}, testInfo) => {
  const correlation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const claimTitle = `S1 KS Scenario ${correlation}`;
  let claimId = '';
  const createdAt = new Date().toISOString().split('T')[0];

  // ═══════════════════════════════════════════════════════════════════════
  // MEMBER: create a single claim and capture ID deterministically
  // ═══════════════════════════════════════════════════════════════════════
  await gotoApp(memberPage, routes.memberNewClaim(testInfo), testInfo, {
    marker: 'body',
  });
  await expect(memberPage).toHaveURL(/\/member\/claims\/new(?:\?|$)/, { timeout: 30_000 });
  await expect(memberPage.getByTestId('category-vehicle')).toBeVisible({ timeout: 30_000 });
  console.log('MARKER_MEMBER_READY');

  await memberPage.getByTestId('category-vehicle').click();
  await memberPage.getByTestId('wizard-next').click();
  await expect(memberPage.getByTestId('claim-title-input')).toBeVisible({ timeout: 30_000 });

  await memberPage.getByTestId('claim-title-input').fill(claimTitle);
  await memberPage.getByTestId('claim-company-input').fill('Interdomestik QA');
  await memberPage.getByTestId('claim-amount-input').fill('100');
  await memberPage.getByTestId('claim-date-input').fill(createdAt);
  await memberPage.getByTestId('claim-description-input').fill('Scenario S1 end-to-end claim');
  await memberPage.getByTestId('wizard-next').click();
  await memberPage.getByTestId('wizard-next').click();
  await memberPage.getByTestId('wizard-submit').click();

  await expect
    .poll(
      async () => {
        const currentUrl = memberPage.url();
        const hasSuccessCard = await memberPage
          .getByTestId('claim-created-success')
          .isVisible()
          .catch(() => false);
        const hasGoToClaim = await memberPage
          .getByTestId('claim-created-go-to-claim')
          .isVisible()
          .catch(() => false);
        const isClaimDetail = /\/member\/claims\/(?!new(?:[/?#]|$))[^/?#]+(?:[?#].*)?$/.test(
          currentUrl
        );
        const isClaimsList = /\/member\/claims(?:[?#].*)?$/.test(currentUrl);
        return hasSuccessCard || hasGoToClaim || isClaimDetail || isClaimsList;
      },
      { timeout: 30_000 }
    )
    .toBe(true);
  console.log(`DEBUG_AFTER_SUBMIT url=${memberPage.url()}`);

  const hasGoToClaim = await memberPage
    .getByTestId('claim-created-go-to-claim')
    .isVisible()
    .catch(() => false);
  if (hasGoToClaim) {
    const claimPath = await memberPage
      .getByTestId('claim-created-go-to-claim')
      .getAttribute('href');
    if (claimPath) {
      claimId = normalizeClaimId(claimIdFromMemberSuccessPath(claimPath));
    }
  }

  if (!claimId) {
    const detailMatch = memberPage.url().match(/\/member\/claims\/(?!new(?:[/?#]|$))([^/?#]+)/);
    if (detailMatch?.[1]) {
      claimId = normalizeClaimId(decodeURIComponent(detailMatch[1]));
    }
  }

  if (!claimId) {
    const hasClaimIdText = await memberPage
      .getByTestId('claim-created-id')
      .isVisible()
      .catch(() => false);
    if (hasClaimIdText) {
      const claimIdText = await memberPage.getByTestId('claim-created-id').innerText();
      const claimIdMatch = claimIdText.match(/([A-Za-z0-9_-]+)\s*$/);
      if (claimIdMatch?.[1]) {
        claimId = normalizeClaimId(claimIdMatch[1]);
      }
    }
  }

  if (!claimId) {
    await expect
      .poll(
        async () => {
          const created = await db.query.claims.findFirst({
            where: eq(claims.title, claimTitle),
            orderBy: (table, { desc }) => [desc(table.createdAt)],
            columns: { id: true },
          });
          return created?.id ?? null;
        },
        { timeout: 30_000 }
      )
      .not.toBeNull();

    const createdClaim = await db.query.claims.findFirst({
      where: eq(claims.title, claimTitle),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      columns: { id: true },
    });
    if (!createdClaim?.id) {
      throw new Error(
        'MEMBER step failed: claim was created but claim ID could not be captured deterministically'
      );
    }
    claimId = createdClaim.id;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AGENT: open claim in workspace and perform agent action
  // ═══════════════════════════════════════════════════════════════════════
  await gotoApp(
    agentPage,
    `${routes.agentWorkspaceClaims(testInfo)}?claimId=${encodeURIComponent(claimId)}`,
    testInfo,
    {
      marker: 'agent-claims-pro-page',
    }
  );

  const selectedClaimId = agentPage.getByTestId('workspace-selected-claim-id');
  await expect(selectedClaimId).toBeVisible({ timeout: 20_000 });
  await expect(selectedClaimId).toHaveText(claimId, { timeout: 20_000 });
  await expect(agentPage.getByTestId('action-message')).toBeVisible({ timeout: 20_000 });

  await agentPage.getByTestId('action-message').click();
  await expect(agentPage.getByTestId('messaging-panel')).toBeVisible({ timeout: 20_000 });
  console.log('MARKER_AGENT_READY');

  // ═══════════════════════════════════════════════════════════════════════
  // STAFF: assign the claim
  // ═══════════════════════════════════════════════════════════════════════
  await gotoApp(staffPage, routes.staffClaimDetail(claimId, testInfo), testInfo, {
    marker: 'staff-claim-detail-actions',
  });

  await expect(staffPage.getByTestId('staff-claim-action-panel')).toBeVisible({ timeout: 20_000 });
  const staffAssignButton = staffPage.getByTestId('staff-assign-claim-button');
  const isAssignVisible = await staffAssignButton.isVisible({ timeout: 20_000 }).catch(() => false);
  if (isAssignVisible) {
    await staffAssignButton.click();
  }

  await expect
    .poll(
      async () =>
        (
          await db.query.claims.findFirst({
            where: eq(claims.id, claimId),
            columns: { staffId: true },
          })
        )?.staffId ?? null,
      { timeout: 20_000 }
    )
    .not.toBeNull();

  console.log('MARKER_STAFF_READY');

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN: verify claim and capture state
  // ═══════════════════════════════════════════════════════════════════════
  const persistedClaim = await db.query.claims.findFirst({
    where: eq(claims.id, claimId),
    columns: { status: true },
  });
  if (!persistedClaim?.status) {
    throw new Error('ADMIN step failed: persisted KS claim status not found');
  }

  await gotoApp(
    adminPage,
    `${routes.adminClaims(testInfo)}?search=${encodeURIComponent(claimId)}`,
    testInfo,
    {
      marker: 'admin-claims-v2-ready',
    }
  );

  const adminClaimCard = adminPage
    .getByTestId('claim-operational-card')
    .filter({ hasText: claimTitle })
    .first();
  await expect(adminClaimCard).toBeVisible({ timeout: 30_000 });
  await expect(adminClaimCard.getByTestId('claim-identity')).toBeVisible({ timeout: 20_000 });
  await expect(adminClaimCard.getByTestId('state-spine')).toBeVisible({ timeout: 20_000 });

  console.log('MARKER_ADMIN_READY');
  console.log(`SCENARIO_S1_CLAIM_ID=${claimId}`);
  console.log(`SCENARIO_S1_ADMIN_STATE=${persistedClaim.status}`);
});

test('Scenario S1 KS Isolation', async ({ adminPage }, testInfo) => {
  const claimId = process.env.SCENARIO_S1_CLAIM_ID;
  if (!claimId) {
    throw new Error('SCENARIO_S1_CLAIM_ID environment variable is missing');
  }

  const targetClaim = await db.query.claims.findFirst({
    where: eq(claims.id, claimId),
    columns: { tenantId: true },
  });
  if (!targetClaim?.tenantId) {
    throw new Error(`SCENARIO CLAIM missing in DB: ${claimId}`);
  }
  if (targetClaim.tenantId !== E2E_USERS.KS_MEMBER.tenantId) {
    throw new Error(
      `WRONG_TENANT_CONTEXT expected=${E2E_USERS.KS_MEMBER.tenantId} actual=${targetClaim.tenantId} claim_id=${claimId}`
    );
  }

  const response = await gotoApp(
    adminPage,
    `/admin/claims/${encodeURIComponent(claimId)}`,
    testInfo,
    {
      marker: 'body',
    }
  );
  const statusCode = response?.status() ?? 0;
  const isLoginRedirect = /\/login(?:[/?#]|$)/i.test(adminPage.url());
  const isNotFound = await adminPage
    .getByTestId('not-found-page')
    .isVisible()
    .catch(() => false);
  const html = await adminPage.content();
  const hasServer404Fallback = html.includes('NEXT_HTTP_ERROR_FALLBACK;404');
  const hasNotFoundMarkup = html.includes('data-testid=\"not-found-page\"');
  const isDeniedByStatus = statusCode === 401 || statusCode === 403 || statusCode === 404;
  if (
    !isLoginRedirect &&
    !isNotFound &&
    !isDeniedByStatus &&
    !hasServer404Fallback &&
    !hasNotFoundMarkup
  ) {
    throw new Error(
      `Isolation breach: MK admin could access KS claim ${claimId} without isolation rejection (status=${statusCode}, url=${adminPage.url()})`
    );
  }

  const hasClaimState = await adminPage
    .getByTestId(`admin-claim-status-${claimId}`)
    .isVisible()
    .catch(() => false);
  if (hasClaimState) {
    throw new Error(`Isolation breach: MK admin sees KS claim state for ${claimId}`);
  }
});
